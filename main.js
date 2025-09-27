const { app, BaseWindow, WebContentsView, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const chokidar = require("chokidar");

app.commandLine.appendSwitch("disable-pinch");

// -------------------- argv helpers --------------------
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

// -------------------- config --------------------
const margins = {
  top: parseNumberFlag("marginTop", 32),
  right: parseNumberFlag("marginRight", 0),
  bottom: parseNumberFlag("marginBottom", 32),
  left: parseNumberFlag("marginLeft", 0),
};

const viewerConfig = {
  pageGap: parseNumberFlag("pageGap", 16),
  pageRadius: parseNumberFlag("pageRadius", 8),
  fit: parseEnumFlag("fit", new Set(["width", "height", "auto"]), "auto"),
  bg: parseStringFlag("bg", "#181616"),
  margins,
};

// -------------------- resolve initial pdf --------------------
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

// -------------------- single instance --------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
} else {
  app.on("second-instance", (_event, argv2) => {
    const newPdf = resolvePdfArg(argv2.slice(1));
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.show();
      mainWin.focus();
    }
    if (newPdf && fs.existsSync(newPdf)) {
      pdfPath = newPdf;
      watchFile(newPdf);
      sendToView("load-pdf", pdfPath);
    }
  });
}

// -------------------- globals --------------------
let mainWin = null;
let view = null;
let watcher = null;

// -------------------- file watching --------------------
function watchFile(filePath) {
  if (watcher) watcher.close();
  watcher = chokidar.watch(filePath, {
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    ignoreInitial: true,
  });
  watcher.on("add", reloadPdf).on("change", reloadPdf);
}

function reloadPdf() {
  if (view && !view.webContents.isDestroyed()) {
    view.webContents.send("reload-pdf", pdfPath);
  }
}

// -------------------- helpers --------------------
function getPdfView() {
  return view;
}
function sendToView(channel, ...args) {
  const v = getPdfView();
  if (v && !v.webContents.isDestroyed()) v.webContents.send(channel, ...args);
}

// -------------------- window & view --------------------
function createWindow() {
  mainWin = new BaseWindow({
    width: 900,
    height: 1200,
    frame: false,
    transparent: true,
    useContentSize: true,
    titleBarStyle: "customButtonsOnHover",
    hasShadow: false,
    backgroundColor: viewerConfig.bg || "#181616",
  });

  view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
      backgroundThrottling: false,
    },
  });

  try {
    view.webContents.setBackgroundColor("#00000000");
  } catch {}

  mainWin.contentView.addChildView(view);

  const setBounds = () => {
    const { width, height } = mainWin.getContentBounds();
    const { top, right, bottom, left } = viewerConfig.margins;
    view.setBounds({
      x: left,
      y: top,
      width: Math.max(0, width - left - right),
      height: Math.max(0, height - top - bottom),
    });
  };
  setBounds();
  mainWin.on("resize", setBounds);

  view.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
  if (view.webContents.setLayoutZoomLevelLimits) {
    view.webContents.setLayoutZoomLevelLimits(0, 0);
  }
  view.webContents.loadFile("index.html");

  view.webContents.on("did-finish-load", () => {
    view.webContents.send("viewer-config", viewerConfig);

    if (pdfPath) {
      view.webContents.send("load-pdf", pdfPath);
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

// -------------------- app lifecycle --------------------
app.whenReady().then(() => {
  createWindow();
  if (keepAlive.ppid && Number.isFinite(keepAlive.ppid)) {
    const ppid = keepAlive.ppid;
    const checkParent = () => {
      try {
        process.kill(ppid, 0);
      } catch {
        if (watcher) watcher.close();
        app.quit();
      }
    };
    setInterval(checkParent, 500).unref();
  }
});

const keepAlive = {
  ppid: parseNumberFlag("ppid", 0),
};

app.on("window-all-closed", () => {
  if (watcher) watcher.close();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (!mainWin) createWindow();
});

// -------------------- IPC --------------------
ipcMain.on("close-window", () => {
  if (watcher) watcher.close();
  app.quit();
});

ipcMain.on("load-new-pdf", (_event, newPath) => {
  if (typeof newPath === "string" && fs.existsSync(newPath)) {
    pdfPath = newPath;
    watchFile(newPath);
    sendToView("reload-pdf", pdfPath);
  }
});
