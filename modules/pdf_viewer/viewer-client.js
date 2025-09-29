import * as pdfjsLib from "../../node_modules/pdfjs-dist/build/pdf.mjs";
import * as pdfjsViewer from "../../node_modules/pdfjs-dist/web/pdf_viewer.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "../../node_modules/pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url,
).toString();

const container = document.getElementById("viewerContainer");
const viewerEl = document.getElementById("viewer");
const { ipcRenderer } = window.electron;

const eventBus = new pdfjsViewer.EventBus();
const linkService = new pdfjsViewer.PDFLinkService({ eventBus });

const pdfViewer = new pdfjsViewer.PDFViewer({
  container,
  viewer: viewerEl,
  eventBus,
  linkService,
  textLayerMode: 2,
  annotationMode: 2,
  useOnlyCssZoom: false,
  enableScripting: false,
  l10n: pdfjsViewer.NullL10n,
});
linkService.setViewer(pdfViewer);

let basePageGap = 32;
let basePageRadius = 8;
let pendingFit = "auto";

ipcRenderer.on("viewer-config", (cfg) => {
  if (typeof cfg?.bg === "string") {
    document.documentElement.style.setProperty("--bg", cfg.bg);
  }
  if (typeof cfg?.pageGap === "number") {
    basePageGap = cfg.pageGap;
    document.documentElement.style.setProperty(
      "--base-page-gap",
      `${cfg.pageGap}px`,
    );
    document.documentElement.style.setProperty(
      "--page-gap",
      `${cfg.pageGap}px`,
    );
  }
  if (typeof cfg?.pageRadius === "number") {
    basePageRadius = cfg.pageRadius;
    document.documentElement.style.setProperty(
      "--page-radius",
      `${cfg.pageRadius}px`,
    );
  }
  if (typeof cfg?.fit === "string") pendingFit = cfg.fit;
});

function getViewState() {
  const scale = pdfViewer.currentScale || 1;
  const pages = viewerEl.querySelectorAll(".page");
  const viewport = container.getBoundingClientRect();
  let topPage = null,
    topY = Infinity;

  for (const p of pages) {
    const r = p.getBoundingClientRect();
    const dist = Math.abs(r.top - viewport.top);
    if (dist < topY) {
      topY = dist;
      topPage = p;
    }
  }

  let pageNumber = pdfViewer.currentPageNumber || 1;
  let relY = 0,
    relX = 0;

  if (topPage) {
    pageNumber = Number(topPage.getAttribute("data-page-number")) || pageNumber;
    const r = topPage.getBoundingClientRect();
    relY = (viewport.top - r.top) / Math.max(1, r.height);
    relX = (viewport.left - r.left) / Math.max(1, r.width);
    relY = Math.max(0, Math.min(1, relY));
    relX = Math.max(0, Math.min(1, relX));
  }

  return { scale, pageNumber, relX, relY };
}

async function restoreViewState({ scale, pageNumber, relX, relY }) {
  if (typeof scale === "number" && scale > 0) {
    pdfViewer.currentScale = scale;
  }
  if (pageNumber) {
    pdfViewer.currentPageNumber = pageNumber;
  }

  await new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(r)),
  );

  const pageView = pdfViewer._pages?.[pageNumber - 1];
  if (!pageView) return;
  const pageEl = pageView.div;

  const rect = pageEl.getBoundingClientRect();
  const pageTop = pageEl.offsetTop;
  const pageLeft = pageEl.offsetLeft;

  const targetTop = pageTop + (relY ?? 0) * Math.max(1, rect.height);
  const targetLeft = pageLeft + (relX ?? 0) * Math.max(1, rect.width);

  container.scrollTop = targetTop;
  container.scrollLeft = targetLeft;
}

function applyInitialFit() {
  if (pendingFit === "width") pdfViewer.currentScaleValue = "page-width";
  else if (pendingFit === "height") pdfViewer.currentScaleValue = "page-fit";
  else pdfViewer.currentScaleValue = "auto";
}

async function openPdf(localPath) {
  if (typeof localPath !== "string" || !localPath.trim()) {
    console.warn("[pdfview] openPdf called without a path");
    return;
  }
  const p = localPath.trim().replace(/\\/g, "/");
  const url = p.startsWith("file://") ? p : `file://${p}`;
  const loadingTask = pdfjsLib.getDocument({
    url,
    cMapUrl: new URL(
      "../../node_modules/pdfjs-dist/cmaps/",
      import.meta.url,
    ).toString(),
    cMapPacked: true,
    standardFontDataUrl: new URL(
      "../../node_modules/pdfjs-dist/standard_fonts/",
      import.meta.url,
    ).toString(),
  });

  const pdfDocument = await loadingTask.promise;
  pdfViewer.setDocument(pdfDocument);
  linkService.setDocument(pdfDocument, null);
}

ipcRenderer.on("load-pdf", (pdfPath) => openPdf(pdfPath));
ipcRenderer.on("reload-pdf", (pdfPath) => {
  if (!pdfPath) return;
  const state = getViewState();
  openPdf(pdfPath).then(() => {
    const onInit = () => {
      eventBus.off("pagesinit", onInit);
      restoreViewState(state);
    };
    eventBus.on("pagesinit", onInit);
  });
});

eventBus.on("pagesinit", () => {
  applyInitialFit();
  updatePageGapForScale(pdfViewer.currentScale || 1);
});

function updatePageGapForScale(scale) {
  document.documentElement.style.setProperty("--layout-scale", String(scale));
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 6;
const ZOOM_INTENSITY = 0.018;

let pinchActive = false;
let committedScale = 1;
let cssScale = 1;
let wheelAccum = 0;
let wheelRAF = 0;
let pinchEndTimer = 0;
let lastPointer = { x: 0, y: 0 };

window.addEventListener(
  "wheel",
  (e) => {
    if (e.ctrlKey || e.metaKey) e.preventDefault();
  },
  { passive: false, capture: true },
);
["gesturestart", "gesturechange", "gestureend"].forEach((t) => {
  window.addEventListener(t, (e) => e.preventDefault(), {
    passive: false,
    capture: true,
  });
});

function beginPinch() {
  if (pinchActive) return;
  pinchActive = true;
  committedScale = pdfViewer.currentScale || 1;
  cssScale = committedScale;
  viewerEl.style.willChange = "transform";
}

function probePageAtClientPoint(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  const pageEl = el && el.closest ? el.closest(".page") : null;
  if (!pageEl) return null;
  const rect = pageEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  const relX = (clientX - rect.left) / rect.width;
  const relY = (clientY - rect.top) / rect.height;
  const pageNo = pageEl.getAttribute("data-page-number");

  const pixelX = clientX - rect.left;
  const pixelY = clientY - rect.top;
  return { pageEl, pageNo, relX, relY, rect, pixelX, pixelY };
}

function makeFreezeOverlayFromVisibleCanvases() {
  const clip = document.getElementById("clip");
  const overlay = document.createElement("div");
  overlay.id = "freezeOverlay";

  Object.assign(overlay.style, {
    position: "absolute",
    left: "0",
    top: "0",
    right: "0",
    bottom: "0",
    pointerEvents: "none",
    zIndex: "2147483647",
    background: "transparent",
  });

  clip.appendChild(overlay);

  const clipRect = clip.getBoundingClientRect();
  const viewport = container.getBoundingClientRect();

  const canvases = viewerEl.querySelectorAll(".page canvas");
  for (const canvas of canvases) {
    const r = canvas.getBoundingClientRect();
    if (r.bottom < viewport.top || r.top > viewport.bottom) continue;

    try {
      const url = canvas.toDataURL("image/png");
      const img = new Image();
      img.decoding = "sync";
      img.loading = "eager";
      img.src = url;

      Object.assign(img.style, {
        position: "absolute",
        left: `${r.left - clipRect.left}px`,
        top: `${r.top - clipRect.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });

      overlay.appendChild(img);
    } catch {}
  }

  overlay.getBoundingClientRect();
  return overlay;
}

function removeFreezeOverlay(overlay) {
  if (!overlay) return;
  overlay.style.opacity = "0";
  setTimeout(() => overlay.remove(), 130);
}

let commitLock = false;
let plannedLeft = 0,
  plannedTop = 0;

function onLockedScroll(e) {
  if (!commitLock) return;
  if (Math.abs(container.scrollLeft - plannedLeft) > 0.01)
    container.scrollLeft = plannedLeft;
  if (Math.abs(container.scrollTop - plannedTop) > 0.01)
    container.scrollTop = plannedTop;
}
container.addEventListener("scroll", onLockedScroll, { passive: true });

function endPinch() {
  if (!pinchActive) return;
  pinchActive = false;

  const targetScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, cssScale || 1));

  const viewportRect = container.getBoundingClientRect();
  const pointerInViewport = {
    x: lastPointer.x - viewportRect.left,
    y: lastPointer.y - viewportRect.top,
  };

  const contentX =
    (container.scrollLeft + pointerInViewport.x) / committedScale;
  const contentY = (container.scrollTop + pointerInViewport.y) / committedScale;

  const overlay = makeFreezeOverlayFromVisibleCanvases();

  viewerEl.style.transform = "";
  viewerEl.style.transformOrigin = "";
  viewerEl.style.willChange = "";

  updatePageGapForScale(targetScale);
  pdfViewer.currentScale = targetScale;
  const newScrollLeft = contentX * targetScale - pointerInViewport.x;
  const newScrollTop = contentY * targetScale - pointerInViewport.y;

  container.scrollLeft = newScrollLeft;
  container.scrollTop = newScrollTop;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      removeFreezeOverlay(overlay);
    });
  });
}

function applyCssPinchAtPointer(targetScaleCandidate) {
  const target = Math.max(MIN_SCALE, Math.min(MAX_SCALE, targetScaleCandidate));
  const rect = container.getBoundingClientRect();
  const originX = container.scrollLeft + (lastPointer.x - rect.left);
  const originY = container.scrollTop + (lastPointer.y - rect.top);
  const cssMultiplier = target / (committedScale || 1);

  viewerEl.style.transformOrigin = `${originX}px ${originY}px`;
  viewerEl.style.transform = `scale(${cssMultiplier})`;
  cssScale = target;
}

container.addEventListener(
  "wheel",
  (e) => {
    const isZoomGesture = e.ctrlKey || e.metaKey;
    if (!isZoomGesture) return;
    e.preventDefault();
    lastPointer = { x: e.clientX, y: e.clientY };
    beginPinch();

    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 800 : 1;
    wheelAccum += e.deltaY * unit;

    if (!wheelRAF) {
      wheelRAF = requestAnimationFrame(() => {
        const factor = Math.exp(-wheelAccum * ZOOM_INTENSITY);
        const current = cssScale || pdfViewer.currentScale || 1;
        applyCssPinchAtPointer(current * factor);
        wheelAccum = 0;
        wheelRAF = 0;
      });
    }

    clearTimeout(pinchEndTimer);
    pinchEndTimer = setTimeout(endPinch, 120);
  },
  { passive: false },
);

let panAnimationId = null;
let panVelocity = { x: 0, y: 0 };
const PAN_BASE_SPEED = 200;
const PAN_SMOOTH_FACTOR = 0.15;
const activePanKeys = new Set();

function getEffectiveScale() {
  return (
    (pinchActive
      ? cssScale || pdfViewer.currentScale || 1
      : pdfViewer.currentScale || 1) || 1
  );
}

function animatePan() {
  if (activePanKeys.size) updatePanVelocity();

  if (Math.abs(panVelocity.x) > 0.1 || Math.abs(panVelocity.y) > 0.1) {
    container.scrollLeft += panVelocity.x;
    container.scrollTop += panVelocity.y;

    if (!activePanKeys.size) {
      panVelocity.x *= 1 - PAN_SMOOTH_FACTOR;
      panVelocity.y *= 1 - PAN_SMOOTH_FACTOR;
    }
    panAnimationId = requestAnimationFrame(animatePan);
  } else {
    panVelocity.x = 0;
    panVelocity.y = 0;
    panAnimationId = null;
  }
}

function updatePanVelocity() {
  const step = PAN_BASE_SPEED * getEffectiveScale();

  let targetVx = 0;
  let targetVy = 0;

  if (activePanKeys.has("h")) targetVx -= step;
  if (activePanKeys.has("l")) targetVx += step;
  if (activePanKeys.has("k")) targetVy -= step;
  if (activePanKeys.has("j")) targetVy += step;

  panVelocity.x += (targetVx - panVelocity.x) * PAN_SMOOTH_FACTOR;
  panVelocity.y += (targetVy - panVelocity.y) * PAN_SMOOTH_FACTOR;

  if (!panAnimationId && (targetVx || targetVy)) {
    panAnimationId = requestAnimationFrame(animatePan);
  }
}

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  const key = e.key.toLowerCase();

  if (["h", "j", "k", "l"].includes(key)) {
    e.preventDefault();
    if (!activePanKeys.has(key)) {
      activePanKeys.add(key);
      updatePanVelocity();
    }
    return;
  }

  if (key === "g" && !e.shiftKey) {
    e.preventDefault();
    container.scrollTop = 0;
    return;
  }

  if (key === "g" && e.shiftKey) {
    e.preventDefault();
    container.scrollTop = container.scrollHeight;
    return;
  }
});

document.addEventListener("keyup", (e) => {
  const key = e.key.toLowerCase();
  if (["h", "j", "k", "l"].includes(key)) {
    activePanKeys.delete(key);
    updatePanVelocity();
  }
});

window.addEventListener("blur", () => {
  activePanKeys.clear();
  updatePanVelocity();
});

document.addEventListener("keydown", (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;

  const rect = container.getBoundingClientRect();
  lastPointer.x = rect.left + rect.width / 2;
  lastPointer.y = rect.top + rect.height / 2;

  const curr = pdfViewer.currentScale || 1;

  if (e.key === "=" || e.key === "+") {
    e.preventDefault();
    beginPinch();
    committedScale = curr;
    applyCssPinchAtPointer(Math.min(MAX_SCALE, curr * 1.2));
    endPinch();
  } else if (e.key === "-" || e.key === "_") {
    e.preventDefault();
    beginPinch();
    committedScale = curr;
    applyCssPinchAtPointer(Math.max(MIN_SCALE, curr / 1.2));
    endPinch();
  } else if (e.key === "0") {
    e.preventDefault();
    beginPinch();
    committedScale = curr;
    applyCssPinchAtPointer(1);
    endPinch();
  }
});

document.addEventListener("keydown", (e) => {
  if (
    ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "q") ||
    e.key === "Escape"
  ) {
    e.preventDefault();
    ipcRenderer.send("close-window");
  }
});
