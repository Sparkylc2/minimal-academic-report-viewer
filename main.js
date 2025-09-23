const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

app.commandLine.appendSwitch("disable-pinch");
let mainWindow;
let watcher;

// Read all argv; we’ll pick the .pdf and flags from here.
const argv = process.argv.slice(1);

// ---------------- CLI flags ----------------
function parseNumberFlag(name, def) {
  const withEq = argv.find((a) => a && a.startsWith(`--${name}=`));
  if (withEq) {
    const v = Number(withEq.split("=")[1]);
    if (!Number.isNaN(v)) return v;
  }
  const i = argv.indexOf(`--${name}`);
  if (i !== -1) {
    const v = Number(argv[i + 1]);
    if (!Number.isNaN(v)) return v;
  }
  return def;
}
function parseEnumFlag(name, allowed, def) {
  const withEq = argv.find((a) => a && a.startsWith(`--${name}=`));
  if (withEq) {
    const val = withEq.split("=")[1];
    if (allowed.has(val)) return val;
  }
  const i = argv.indexOf(`--${name}`);
  if (i !== -1) {
    const val = argv[i + 1];
    if (allowed.has(val)) return val;
  }
  return def;
}
function parseStringFlag(name, def) {
  const withEq = argv.find((a) => a && a.startsWith(`--${name}=`));
  if (withEq) return withEq.split("=").slice(1).join("=") || def;
  const i = argv.indexOf(`--${name}`);
  if (i !== -1) return argv[i + 1] || def;
  return def;
}

// Keep only what you asked for
const viewerConfig = {
  pageGap: parseNumberFlag("pageGap", 16),
  pageRadius: parseNumberFlag("pageRadius", 8),
  fit: parseEnumFlag("fit", new Set(["width", "height", "auto"]), "auto"),
  bg: parseStringFlag("bg", "#181616"),
};

// Pick the first .pdf argument
function resolvePdfArg(args) {
  for (const raw of args) {
    if (!raw || raw.startsWith("--")) continue;
    const a = String(raw).trim();
    if (/\.pdf$/i.test(a)) return path.resolve(a);
    try {
      const abs = path.resolve(a);
      if (fs.existsSync(abs) && path.extname(abs).toLowerCase() === ".pdf") {
        return abs;
      }
    } catch (_) {}
  }
  return null;
}
let pdfPath = resolvePdfArg(argv);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 1200,
    frame: false,
    transparent: true,
    backgroundColor: (viewerConfig && viewerConfig.bg) || "#181616",
    titleBarStyle: "customButtonsOnHover",
    hasShadow: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
  if (mainWindow.webContents.setLayoutZoomLevelLimits) {
    mainWindow.webContents.setLayoutZoomLevelLimits(0, 0);
  }

  // Disable browser bitmap zoom; we implement true pdf.js zoom in the renderer.
  mainWindow.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});

  mainWindow.setTitle("PDF Viewer");
  mainWindow.loadFile("index.html");

  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.send("viewer-config", viewerConfig);

    if (pdfPath) {
      mainWindow.webContents.send("load-pdf", pdfPath);
      if (fs.existsSync(pdfPath)) {
        watchFile(pdfPath);
      } else {
        console.warn("[pdfview] Path did not exist at launch:", pdfPath);
      }
    } else {
      console.warn("[pdfview] No .pdf argument found. argv =", argv);
    }
  });
}

function reloadPdf() {
  if (pdfPath && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("reload-pdf", pdfPath);
  }
}

function watchFile(filePath) {
  if (watcher) watcher.close();
  let debounce;
  watcher = fs.watch(filePath, (eventType) => {
    if (eventType === "change") {
      clearTimeout(debounce);
      debounce = setTimeout(reloadPdf, 200);
    }
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (watcher) watcher.close();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.on("load-new-pdf", (_event, newPath) => {
  if (typeof newPath === "string" && fs.existsSync(newPath)) {
    pdfPath = newPath;
    watchFile(newPath);
    reloadPdf();
  }
});
