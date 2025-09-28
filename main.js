const {
  app,
  BaseWindow,
  WebContentsView,
  ipcMain,
  globalShortcut,
} = require("electron");

const path = require("path");
const fs = require("fs");
const chokidar = require("chokidar");

let CommandPalette = null;
let TabManager = null;

try {
  const palettePath = path.join(__dirname, "./modules/command_palette/palette");
  if (fs.existsSync(palettePath + ".js")) {
    CommandPalette = require(palettePath);
    console.log("[MAIN] CommandPalette module loaded");
  } else {
    console.warn("[MAIN] CommandPalette module not found at:", palettePath);
  }
} catch (e) {
  console.error("[MAIN] Failed to load CommandPalette:", e);
}

try {
  const tabPath = path.join(__dirname, "./modules/tab_manager"); // CHANGE: content_manager -> tab_manager
  if (fs.existsSync(tabPath + ".js")) {
    TabManager = require(tabPath); // CHANGE
    console.log("[MAIN] TabManager module loaded"); // CHANGE
  } else {
    console.warn("[MAIN] TabManager module not found at:", tabPath); // CHANGE
  }
} catch (e) {
  console.error("[MAIN] Failed to load TabManager:", e); // CHANGE
}

app.commandLine.appendSwitch("disable-pinch");

// -------------------- argv helpers --------------------
const argv = process.argv.slice(process.defaultApp ? 2 : 1);

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
  top: parseNumberFlag("marginTop", 16),
  right: parseNumberFlag("marginRight", 0),
  bottom: parseNumberFlag("marginBottom", 16),
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
let watcher = null;
let commandPalette = null;
let tabManager = null;
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

function resolveInitialTarget(args) {
  for (const raw of args) {
    if (!raw || raw.startsWith("--")) continue;

    const a = String(raw).trim();
    console.log("A", a);
    if (a.startsWith("http://") || a.startsWith("https://")) return a;

    if (/\.pdf$/i.test(a)) {
      try {
        const abs = path.resolve(a);
        console.log(abs);
        if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
      } catch (_) {}
    }
  }
  return null;
}
let initialTarget = resolveInitialTarget(argv);
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

  // REMOVE THE view CREATION AND ALL view-related code

  // CHANGE: Create tab manager instead
  tabManager = new TabManager(mainWin, viewerConfig);

  // Create command palette
  commandPalette = new CommandPalette(mainWin);
  commandPalette.tabManager = tabManager; // CHANGE: Link them together

  globalShortcut.register("CommandOrControl+R", () => {
    if (mainWin && !mainWin.isDestroyed() && commandPalette) {
      commandPalette.toggle();
    }
  });

  // CHANGE: Use tab manager for initial target
  if (initialTarget) {
    if (initialTarget.endsWith(".pdf")) {
      tabManager.getOrCreatePdfTab(initialTarget);
    } else {
      tabManager.getOrCreateWebTab(initialTarget);
    }
  } else {
    tabManager.getOrCreateWebTab("https://google.com");
  }
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
  if (tabManager && typeof newPath === "string") {
    // CHANGE
    tabManager.getOrCreatePdfTab(newPath); // CHANGE
  }
});
