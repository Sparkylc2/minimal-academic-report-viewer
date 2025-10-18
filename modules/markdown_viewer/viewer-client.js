const container = document.getElementById("viewerContainer");
const contentEl = document.getElementById("content");
const { ipcRenderer } = window.electron;

let currentPath = null;

ipcRenderer.on("viewer-config", (cfg) => {
  if (typeof cfg?.bg === "string") {
    document.documentElement.style.setProperty("--bg", cfg.bg);
  }
  if (typeof cfg?.pageRadius === "number") {
    document.documentElement.style.setProperty(
      "--page-radius",
      `${cfg.pageRadius}px`,
    );
  }
});

function getViewState() {
  return {
    top: container.scrollTop | 0,
    left: container.scrollLeft | 0,
  };
}

async function restoreViewState(state) {
  if (!state) return;
  await new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(r)),
  );

  const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
  const maxLeft = Math.max(0, container.scrollWidth - container.clientWidth);
  container.scrollTop = Math.min(state.top, maxTop);
  container.scrollLeft = Math.min(state.left, maxLeft);
}

async function loadMarkdown(filePath, stateToRestore = null) {
  if (typeof filePath !== "string" || !filePath.trim()) return;
  currentPath = filePath.trim();

  try {
    const md = await window.ipcRenderer.invoke("read-file", currentPath, {
      encoding: "utf8",
    });

    const { marked } = await import(
      "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js"
    );
    marked.setOptions({ gfm: true, breaks: true });

    contentEl.innerHTML = marked.parse(md);

    if (stateToRestore) {
      await restoreViewState(stateToRestore);
    } else {
      container.scrollTop = 0;
      container.scrollLeft = 0;
    }
  } catch (err) {
    console.error("[mdview] Error loading markdown:", err);
    contentEl.innerHTML = `<p style="color:#ff6b6b;">Error loading markdown: ${err.message}</p>`;
  }
}

ipcRenderer.on("load-md", (mdPath) => loadMarkdown(mdPath));

ipcRenderer.on("reload-md", (mdPath) => {
  const state = getViewState();
  loadMarkdown(mdPath || currentPath, state);
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

ipcRenderer.on("get-view-state", () => {
  const state = getViewState();
  ipcRenderer.sendToHost("view-state-response", state);
});

ipcRenderer.on("restore-view-state", (state) => {
  if (state) {
    restoreViewState(state);
  }
});

window.getViewState = getViewState;

ipcRenderer.on("restore-view-state", (state) => {
  if (state) {
    restoreViewState(state);
  }
});
