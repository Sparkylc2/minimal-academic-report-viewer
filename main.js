const {
  app,
  BaseWindow,
  screen,
  WebContentsView,
  ipcMain,
  globalShortcut,
} = require("electron");

const path = require("path");
const fs = require("fs");
const chokidar = require("chokidar");

let CommandPalette = require("./modules/command_palette/palette");
let TabManager = require("./modules/tab_manager");
let TabBar = require("./modules/tab_bar/tab_bar");

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
  bottom: parseNumberFlag("marginBottom", 8),
  left: parseNumberFlag("marginLeft", 0),
};

const viewerConfig = {
  pageGap: parseNumberFlag("pageGap", 16),
  pageRadius: parseNumberFlag("pageRadius", 8),
  fit: parseEnumFlag("fit", new Set(["width", "height", "auto"]), "auto"),
  bg: parseStringFlag("bg", "#181616"),
  margins,
};

function isHighDPI() {
  const scaleFactor = screen.getPrimaryDisplay().scaleFactor;
  return scaleFactor > 1;
}
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
      ensurePdfTabLoaded(newPdf);
      watchFile(newPdf);
      sendToPdfView("load-pdf", newPdf);
    }
  });
}

// -------------------- globals --------------------
let mainWin = null;
let watcher = null;
let commandPalette = null;
let tabManager = null;
let tabBar = null;

let pdfPath = null;
let initialTarget = resolveInitialTarget(argv);
let highDPI = false;

// -------------------- file watching (global, single PDF) --------------------
function watchFile(filePath) {
  if (watcher) {
    try {
      watcher.close();
    } catch {}
    watcher = null;
  }
  if (!filePath || !fs.existsSync(filePath)) return;

  watcher = chokidar.watch(filePath, {
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    ignoreInitial: true,
  });

  watcher.on("add", reloadPdf).on("change", reloadPdf);
}

function getPdfView() {
  if (!tabManager) return null;
  const firstPdfId = tabManager.getFirstPdfTab
    ? tabManager.getFirstPdfTab()
    : null;
  if (!firstPdfId) return null;

  const tab = tabManager.tabs && tabManager.tabs.get(firstPdfId);
  return tab && tab.view ? tab.view : null;
}

function sendToPdfView(channel, ...args) {
  const v = getPdfView();
  if (v && !v.webContents.isDestroyed()) v.webContents.send(channel, ...args);
}

function reloadPdf() {
  if (pdfPath) {
    sendToPdfView("reload-pdf", pdfPath);
  }
}

// -------------------- helpers --------------------
function resolveInitialTarget(args) {
  for (const raw of args) {
    if (!raw || raw.startsWith("--")) continue;
    const a = String(raw).trim();

    if (a.startsWith("http://") || a.startsWith("https://")) return a;

    if (/\.pdf$/i.test(a)) {
      try {
        const abs = path.resolve(a);
        if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
      } catch (_) {}
    }
  }
  return null;
}

function ensurePdfTabLoaded(targetPath) {
  if (!tabManager) return;
  tabManager.getOrCreatePdfTab(targetPath);
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

  tabManager = new TabManager(mainWin, viewerConfig);

  tabBar = new TabBar(mainWin, tabManager, highDPI, viewerConfig);
  tabBar.show();

  commandPalette = new CommandPalette(mainWin, tabManager);

  mainWin.tabManager = tabManager;
  mainWin.commandPalette = commandPalette;

  registerKeyboardShortcuts();

  if (initialTarget) {
    if (initialTarget.endsWith(".pdf")) {
      pdfPath = initialTarget;
      ensurePdfTabLoaded(initialTarget);
      watchFile(initialTarget);
    } else {
      tabManager.createWebTab(initialTarget);
    }
  } else {
    tabManager.createWebTab("https://google.com");
  }
}

function registerKeyboardShortcuts() {
  // CMD+T - Open command palette for new tab
  globalShortcut.register("CommandOrControl+F", () => {
    if (mainWin && !mainWin.isDestroyed() && commandPalette) {
      commandPalette.show();
    }
  });

  // Alt+Shift+T - Reopen closed tab
  globalShortcut.register("CommandOrControl+Shift+F", () => {
    if (mainWin && !mainWin.isDestroyed() && tabManager) {
      tabManager.reopenClosedTab();
    }
  });

  // Cmd+W - Close current tab
  globalShortcut.register("CommandOrControl+W", () => {
    if (mainWin && !mainWin.isDestroyed() && tabManager) {
      tabManager.closeCurrentTab();
    }
  });

  // Cmd+1-9 - Switch tabs
  for (let i = 1; i <= 9; i++) {
    globalShortcut.register(`CommandOrControl+${i}`, () => {
      if (mainWin && !mainWin.isDestroyed() && tabManager) {
        tabManager.switchToTabByIndex(i);
      }
    });
  }

  // Cmd+R - Show/hide command palette (keep existing)
  globalShortcut.register("CommandOrControl+R", () => {
    if (mainWin && !mainWin.isDestroyed() && commandPalette) {
      commandPalette.toggle();
    }
  });

  // Navigation shortcuts
  globalShortcut.register("CommandOrControl+Left", () => {
    if (mainWin && !mainWin.isDestroyed() && tabManager) {
      tabManager.navigateBack();
    }
  });

  globalShortcut.register("CommandOrControl+Right", () => {
    if (mainWin && !mainWin.isDestroyed() && tabManager) {
      tabManager.navigateForward();
    }
  });
}

function unregisterKeyboardShortcuts() {
  globalShortcut.unregisterAll();
}

// -------------------- app lifecycle --------------------
app.whenReady().then(() => {
  highDPI = isHighDPI();
  if (highDPI) {
    Object.keys(viewerConfig.margins).forEach((k) => {
      viewerConfig.margins[k] = Math.round(viewerConfig.margins[k] * 2);
    });
  }
  createWindow();
  if (keepAlive.ppid && Number.isFinite(keepAlive.ppid)) {
    const ppid = keepAlive.ppid;
    const checkParent = () => {
      try {
        process.kill(ppid, 0);
      } catch {
        if (watcher) watcher.close();
        unregisterKeyboardShortcuts();
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
  unregisterKeyboardShortcuts();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (!mainWin) createWindow();
});

app.on("will-quit", () => {
  unregisterKeyboardShortcuts();
});

// -------------------- IPC --------------------
ipcMain.on("close-window", () => {
  if (watcher) watcher.close();
  unregisterKeyboardShortcuts();
  app.quit();
});

ipcMain.on("load-new-pdf", (_event, newPath) => {
  if (typeof newPath !== "string" || !newPath.trim()) return;
  const abs = path.resolve(newPath.trim());
  if (!fs.existsSync(abs)) return;

  pdfPath = abs;
  ensurePdfTabLoaded(abs);
  watchFile(abs);
  sendToPdfView("load-pdf", abs);
});
