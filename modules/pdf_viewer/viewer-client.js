import * as pdfjsLib from "../../node_modules/pdfjs-dist/build/pdf.mjs";
import * as pdfjsViewer from "../../node_modules/pdfjs-dist/web/pdf_viewer.mjs";
import { debugLog } from "../utils.js";

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

ipcRenderer.on("get-state", (event, requestId) => {
  const state = getViewState();
  ipcRenderer.send("state-response", requestId, state);
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

  const maxScrollLeft = Math.max(
    0,
    container.scrollWidth - container.clientWidth,
  );
  const maxScrollTop = Math.max(
    0,
    container.scrollHeight - container.clientHeight,
  );

  container.scrollLeft = Math.max(0, Math.min(newScrollLeft, maxScrollLeft));
  container.scrollTop = Math.max(0, Math.min(newScrollTop, maxScrollTop));

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      removeFreezeOverlay(overlay);
    });
  });
}
function schedulePinchCommit(delay = 140) {
  clearTimeout(pinchEndTimer);
  pinchEndTimer = setTimeout(endPinch, delay);
}

function centerPointerOnViewport() {
  const rect = container.getBoundingClientRect();
  lastPointer.x = rect.left + rect.width / 2;
  lastPointer.y = rect.top + rect.height / 2;
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
const PAN_BASE_SPEED = window.devicePixelRatio > 1 ? 3.5 : 1;
const PAN_SPEED_MODIFIER = 2.5;
const PAN_SMOOTH_FACTOR = 0.15;

const activePanKeys = new Map();
const MAX_KEY_HOLD_TIME = 3000;

const DIR_KEYS = new Set([
  "h",
  "j",
  "k",
  "l",
  "arrowleft",
  "arrowright",
  "arrowup",
  "arrowdown",
]);

let pageDigitBuffer = "";

function isEditableTarget(el) {
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return (
    el.isContentEditable ||
    tag === "input" ||
    tag === "textarea" ||
    tag === "select"
  );
}

function commitPageBuffer() {
  if (!pageDigitBuffer) return;
  const n = parseInt(pageDigitBuffer, 10);
  const max = pdfViewer.pagesCount || 1;
  if (!Number.isNaN(n)) {
    const target = Math.min(Math.max(1, n), max);
    pdfViewer.currentPageNumber = target;
  }
  pageDigitBuffer = "";
}

function anyDirKeyActive() {
  for (const k of activePanKeys.keys()) {
    if (DIR_KEYS.has(k)) return true;
  }
  return false;
}

function clearAllPanKeys() {
  activePanKeys.clear();
  panVelocity.x = 0;
  panVelocity.y = 0;
}

function cleanupStuckKeys() {
  const now = Date.now();
  const toDelete = [];

  for (const [key, timestamp] of activePanKeys.entries()) {
    if (now - timestamp > MAX_KEY_HOLD_TIME) {
      toDelete.push(key);
    }
  }

  if (toDelete.length > 0) {
    console.warn("[pdf-viewer] Clearing stuck keys:", toDelete);
    toDelete.forEach((key) => activePanKeys.delete(key));
  }
}

function animatePan() {
  cleanupStuckKeys();

  if (activePanKeys.size > 0) {
    updatePanVelocity();
  }

  if (Math.abs(panVelocity.x) > 0.1 || Math.abs(panVelocity.y) > 0.1) {
    container.scrollLeft += panVelocity.x;
    container.scrollTop += panVelocity.y;

    if (!anyDirKeyActive()) {
      panVelocity.x *= 1 - PAN_SMOOTH_FACTOR;
      panVelocity.y *= 1 - PAN_SMOOTH_FACTOR;
    }

    panAnimationId = requestAnimationFrame(animatePan);
  } else {
    if (!anyDirKeyActive()) {
      panVelocity.x = 0;
      panVelocity.y = 0;
      panAnimationId = null;
      return;
    }

    panAnimationId = requestAnimationFrame(animatePan);
  }
}

function updatePanVelocity() {
  const step =
    PAN_BASE_SPEED * (activePanKeys.has("shift") ? PAN_SPEED_MODIFIER : 1);

  let targetVx = 0;
  let targetVy = 0;

  if (activePanKeys.has("h") || activePanKeys.has("arrowleft"))
    targetVx -= step;
  if (activePanKeys.has("l") || activePanKeys.has("arrowright"))
    targetVx += step;
  if (activePanKeys.has("k") || activePanKeys.has("arrowup")) targetVy -= step;
  if (activePanKeys.has("j") || activePanKeys.has("arrowdown"))
    targetVy += step;

  panVelocity.x += (targetVx - panVelocity.x) * PAN_SMOOTH_FACTOR;
  panVelocity.y += (targetVy - panVelocity.y) * PAN_SMOOTH_FACTOR;

  if (
    !panAnimationId &&
    (anyDirKeyActive() ||
      Math.abs(panVelocity.x) > 0.1 ||
      Math.abs(panVelocity.y) > 0.1)
  ) {
    panAnimationId = requestAnimationFrame(animatePan);
  }
}

document.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();

  if (
    [
      "h",
      "j",
      "k",
      "l",
      "arrowleft",
      "arrowright",
      "arrowup",
      "arrowdown",
    ].includes(key)
  ) {
    e.preventDefault();
    if (e.shiftKey && !activePanKeys.has("shift")) {
      activePanKeys.set("shift", Date.now());
    }
    if (!activePanKeys.has(key)) {
      activePanKeys.set(key, Date.now());
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

  if (!e.shiftKey) {
    activePanKeys.delete("shift");
  }

  if (
    [
      "h",
      "j",
      "k",
      "l",
      "arrowleft",
      "arrowright",
      "arrowup",
      "arrowdown",
    ].includes(key)
  ) {
    activePanKeys.delete(key);
    updatePanVelocity();
  }
});

document.addEventListener(
  "keydown",
  (e) => {
    if (
      e.key === "Shift" ||
      e.key === "Control" ||
      e.key === "Meta" ||
      e.key === "Alt"
    ) {
      if (activePanKeys.has("shift")) {
        activePanKeys.set("shift", Date.now());
      }
    }
  },
  true,
);

document.addEventListener(
  "keyup",
  (e) => {
    if (
      e.key === "Shift" ||
      e.key === "Control" ||
      e.key === "Meta" ||
      e.key === "Alt"
    ) {
      clearAllPanKeys();
    }
  },
  true,
);

window.addEventListener("blur", () => {
  clearAllPanKeys();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearAllPanKeys();
  }
});

container.addEventListener(
  "mousedown",
  () => {
    if (activePanKeys.size > 0) {
      clearAllPanKeys();
    }
  },
  true,
);

document.addEventListener("keydown", (e) => {
  if (e.defaultPrevented) return;
  if (isEditableTarget(document.activeElement)) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  const k = e.key;

  if (k === "Enter") {
    e.preventDefault();
    if (pageDigitBuffer) {
      commitPageBuffer();
      return;
    }
    const max = pdfViewer.pagesCount || 1;
    const curr = pdfViewer.currentPageNumber || 1;
    const next = Math.min(Math.max(1, curr + (e.shiftKey ? -1 : 1)), max);
    pdfViewer.currentPageNumber = next;
    return;
  }
});

document.addEventListener("keydown", (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;

  const key = e.key;

  if (key === "=" || key === "+" || key === "-" || key === "_" || key === "0") {
    e.preventDefault();

    centerPointerOnViewport();

    const currCommitted = pdfViewer.currentScale || 1;
    const basis = pinchActive ? cssScale || currCommitted : currCommitted;

    if (!pinchActive) {
      beginPinch();
      committedScale = currCommitted;
    }

    let target = basis;
    if (key === "=" || key === "+") {
      target = Math.min(MAX_SCALE, basis * 1.2);
    } else if (key === "-" || key === "_") {
      target = Math.max(MIN_SCALE, basis / 1.2);
    } else if (key === "0") {
      target = 1;
    }

    applyCssPinchAtPointer(target);

    schedulePinchCommit(140);
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

window.getViewState = getViewState;

ipcRenderer.on("restore-view-state", (state) => {
  if (state) {
    restoreViewState(state);
  }
});

container.addEventListener(
  "click",
  async (e) => {
    if (!e.ctrlKey && !e.metaKey) return;

    e.preventDefault();
    e.stopPropagation();

    const pageEl = e.target.closest(".page");
    if (!pageEl) return;

    const pageNumber = parseInt(pageEl.getAttribute("data-page-number"));
    if (!pageNumber) return;

    const canvas = pageEl.querySelector("canvas");
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scale = pdfViewer.currentScale || 1;

    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const x = (clickX / scale) * (72 / 96);
    const y = (clickY / scale) * (72 / 96);

    debugLog(`[SyncTeX] Click at page ${pageNumber}, x=${x}, y=${y}`);
    debugLog(
      `[SyncTeX] Canvas size: ${rect.width}x${rect.height}, scale: ${scale}`,
    );

    ipcRenderer.send("synctex-click", {
      page: pageNumber,
      x: Math.round(x),
      y: Math.round(y),
    });
  },
  true,
);

ipcRenderer.on("synctex-goto-location", async (location) => {
  debugLog("Going to location:", location);
  const { page, x, y } = location;

  debugLog(`[SyncTeX] Jumping to page ${page}, position (${x}, ${y})`);

  if (page !== pdfViewer.currentPageNumber) {
    pdfViewer.currentPageNumber = page;

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  const pageView = pdfViewer._pages?.[page - 1];
  if (!pageView) {
    console.error("[SyncTeX] Could not find page view");
    return;
  }

  const pageEl = pageView.div;
  const rect = pageEl.getBoundingClientRect();

  const scale = pdfViewer.currentScale || 1;
  const screenX = x * scale * (96 / 72);
  const screenY = y * scale * (96 / 72);

  const targetScrollLeft =
    pageEl.offsetLeft + screenX - container.clientWidth / 2;
  const targetScrollTop =
    pageEl.offsetTop + screenY - container.clientHeight / 2;

  container.scrollTo({
    left: Math.max(0, targetScrollLeft),
    top: Math.max(0, targetScrollTop),
    behavior: "smooth",
  });

  createSyncHighlight(pageEl, screenX, screenY);
});

function createSyncHighlight(pageEl, x, y) {
  const existing = document.getElementById("synctex-highlight");
  if (existing) existing.remove();

  const highlight = document.createElement("div");
  highlight.id = "synctex-highlight";
  highlight.style.cssText = `
    position: absolute;
    left: ${x}px;
    top: ${y}px;
    width: 20px;
    height: 20px;
    margin-left: -10px;
    margin-top: -10px;
    border: 2px solid #ff6b6b;
    border-radius: 50%;
    background: rgba(255, 107, 107, 0.2);
    pointer-events: none;
    z-index: 1000;
    animation: synctex-pulse 1s ease-out;
  `;

  if (!document.getElementById("synctex-highlight-style")) {
    const style = document.createElement("style");
    style.id = "synctex-highlight-style";
    style.textContent = `
      @keyframes synctex-pulse {
        0% {
          transform: scale(0.5);
          opacity: 1;
        }
        50% {
          transform: scale(1.5);
          opacity: 0.8;
        }
        100% {
          transform: scale(1);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  pageEl.appendChild(highlight);

  setTimeout(() => highlight.remove(), 1000);
}
