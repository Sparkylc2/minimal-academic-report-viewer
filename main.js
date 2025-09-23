const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

app.commandLine.appendSwitch("disable-pinch");
let mainWindow;
let watcher;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
} else {
  app.on("second-instance", (_event, argv2 /*, workingDir */) => {
    const newPdf = resolvePdfArg(argv2.slice(1));
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
    if (newPdf && fs.existsSync(newPdf)) {
      pdfPath = newPdf;
      watchFile(newPdf);
      reloadPdf();
    }
  });
}
const argv = process.argv.slice(1);

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

const viewerConfig = {
  pageGap: parseNumberFlag("pageGap", 16),
  pageRadius: parseNumberFlag("pageRadius", 8),
  fit: parseEnumFlag("fit", new Set(["width", "height", "auto"]), "auto"),
  bg: parseStringFlag("bg", "#181616"),
};

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

  mainWindow.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});

  mainWindow.setTitle("TeX PDF Viewer");
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

const chokidar = require("chokidar");

function watchFile(filePath) {
  if (watcher) watcher.close();
  watcher = chokidar.watch(filePath, {
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    ignoreInitial: true,
  });
  watcher
    .on("add", reloadPdf)
    .on("change", reloadPdf)
    .on("unlink", () => {});
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
