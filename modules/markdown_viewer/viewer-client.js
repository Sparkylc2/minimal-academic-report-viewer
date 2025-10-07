// markdown_viewer/viewer-client.js
const container = document.getElementById("viewerContainer");
const contentEl = document.getElementById("content");
const { ipcRenderer } = window.electron;

let currentPath = null;

// apply basic config (kept from your version)
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

// --- simplest possible view-state: just the scroll offsets ---
function getViewState() {
  return {
    top: container.scrollTop | 0,
    left: container.scrollLeft | 0,
  };
}

async function restoreViewState(state) {
  if (!state) return;
  // let layout settle after we replace content
  await new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(r)),
  );

  const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
  const maxLeft = Math.max(0, container.scrollWidth - container.clientWidth);
  container.scrollTop = Math.min(state.top, maxTop);
  container.scrollLeft = Math.min(state.left, maxLeft);
}

// --- load/reload markdown file, restoring scroll/pan if provided ---
async function loadMarkdown(filePath, stateToRestore = null) {
  if (typeof filePath !== "string" || !filePath.trim()) return;
  currentPath = filePath.trim();

  try {
    // read file through your invoke bridge (Approach B)
    const md = await window.electron.ipcRenderer.invoke(
      "read-file",
      currentPath,
      { encoding: "utf8" },
    );

    // render via marked
    const { marked } = await import(
      "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js"
    );
    marked.setOptions({ gfm: true, breaks: true });

    contentEl.innerHTML = marked.parse(md);

    if (stateToRestore) {
      await restoreViewState(stateToRestore);
    } else {
      container.scrollTop = 0; // fresh load -> top
      container.scrollLeft = 0;
    }
  } catch (err) {
    console.error("[mdview] Error loading markdown:", err);
    contentEl.innerHTML = `<p style="color:#ff6b6b;">Error loading markdown: ${err.message}</p>`;
  }
}

// initial load
ipcRenderer.on("load-md", (mdPath) => loadMarkdown(mdPath));

// reload with state preservation
ipcRenderer.on("reload-md", (mdPath) => {
  const state = getViewState(); // snapshot BEFORE we change content
  loadMarkdown(mdPath || currentPath, state);
});

// close shortcuts (kept from your version)
document.addEventListener("keydown", (e) => {
  if (
    ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "q") ||
    e.key === "Escape"
  ) {
    e.preventDefault();
    ipcRenderer.send("close-window");
  }
});
