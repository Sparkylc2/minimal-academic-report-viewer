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
const fsp = require("fs/promises");
const chokidar = require("chokidar");

const CommandPalette = require("./modules/command_palette/palette");
const TabManager = require("./modules/tab_manager");
const TabBar = require("./modules/tab_bar/tab_bar");
const AIChat = require("./modules/ai_chat/ai_chat");
const QuickList = require("./modules/quicklist/quicklist");
const MarkdownViewer = require("./modules/markdown_viewer/viewer");

// -------------------- argv helpers --------------------
const argv = process.argv.slice(process.defaultApp ? 2 : 1);

console.log("args", argv);
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
  widthPercent: Math.min(1, parseNumberFlag("widthPercent", 0.95)),
};

function isHighDPI() {
  const scaleFactor = screen.getPrimaryDisplay().scaleFactor;
  return scaleFactor > 1;
}
// -------------------- resolve initial pdf --------------------
function resolveFileArg(args) {
  for (const raw of args) {
    if (!raw || raw.startsWith("--")) continue;
    const a = String(raw).trim();
    if (path.isAbsolute(a) && fs.existsSync(a)) {
      const ext = path.extname(a).toLowerCase();
      if (ext === ".pdf" || ext === ".md" || ext === ".markdown") {
        return a;
      }
    }
    if (/\.(pdf|md|markdown)$/i.test(a)) return path.resolve(a);
    try {
      const abs = path.resolve(a);
      if (fs.existsSync(abs)) {
        const ext = path.extname(abs).toLowerCase();
        if (ext === ".pdf" || ext === ".md" || ext === ".markdown") {
          return abs;
        }
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
    const newFile = resolveFileArg(argv2.slice(1));
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.show();
      mainWin.focus();
    }
    if (newFile && fs.existsSync(newFile)) {
      const ext = path.extname(newFile).toLowerCase();
      if (ext === ".pdf") {
        filePath = newFile;
        ensurePdfTabLoaded(newFile);
        watchFile(newFile);
        sendToPdfView("load-pdf", newFile);
      } else if (ext === ".md" || ext === ".markdown") {
        filePath = newFile;
        ensureMarkdownTabLoaded(newFile);
        watchFile(newFile);
        sendToMarkdownView("load-md", newFile);
      }
    }
  });
}

// -------------------- globals --------------------
let mainWin = null;
let watcher = null;
let commandPalette = null;
let tabManager = null;
let tabBar = null;
let aiChat = null;
let quickList = null;
let markdownViewer = null;

let filePath = null;
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

  watcher.on("add", reloadFile).on("change", reloadFile);
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

function getMarkdownView() {
  if (!tabManager) return null;
  const firstMdId = tabManager.getFirstMarkdownTab
    ? tabManager.getFirstMarkdownTab()
    : null;
  if (!firstMdId) return null;

  const tab = tabManager.tabs && tabManager.tabs.get(firstMdId);
  return tab && tab.view ? tab.view : null;
}

function sendToPdfView(channel, ...args) {
  const v = getPdfView();
  if (v && !v.webContents.isDestroyed()) v.webContents.send(channel, ...args);
}

function sendToMarkdownView(channel, ...args) {
  const v = getMarkdownView();
  if (v && !v.webContents.isDestroyed()) v.webContents.send(channel, ...args);
}

function reloadFile() {
  if (!filePath) return;

  if (filePath.endsWith(".md") || filePath.endsWith(".markdown")) {
    sendToMarkdownView("reload-md", filePath);
  } else if (filePath.endsWith(".pdf")) {
    sendToPdfView("reload-pdf", filePath);
  }
}

// -------------------- helpers --------------------
function resolveInitialTarget(args) {
  for (const raw of args) {
    if (!raw || raw.startsWith("--")) continue;
    const a = String(raw).trim();

    if (a.startsWith("http://") || a.startsWith("https://")) return a;

    if (/\.(pdf|md|markdown)$/i.test(a)) {
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

function ensureMarkdownTabLoaded(targetPath) {
  if (!tabManager) return;
  tabManager.getOrCreateMarkdownTab(targetPath);
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
  tabManager.on("all-tabs-closed", () => performClose());

  tabBar = new TabBar(mainWin, tabManager, highDPI, viewerConfig);
  tabBar.show();

  commandPalette = new CommandPalette(mainWin, tabManager, viewerConfig);
  aiChat = new AIChat(mainWin, viewerConfig);
  quickList = new QuickList(mainWin, tabManager, viewerConfig);
  markdownViewer = new MarkdownViewer(mainWin, viewerConfig);

  mainWin.tabManager = tabManager;
  mainWin.commandPalette = commandPalette;

  registerKeyboardShortcuts();
  if (initialTarget) {
    if (initialTarget.endsWith(".pdf")) {
      filePath = initialTarget;
      ensurePdfTabLoaded(initialTarget);
      watchFile(initialTarget);
    } else if (
      initialTarget.endsWith(".md") ||
      initialTarget.endsWith(".markdown")
    ) {
      filePath = initialTarget;
      ensureMarkdownTabLoaded(initialTarget);
      watchFile(initialTarget);
    } else {
      tabManager.createWebTab(initialTarget);
    }
  } else {
    tabManager.createWebTab("https://google.com");
  }
}

function registerKeyboardShortcuts() {
  globalShortcut.register("CommandOrControl+R", () => {
    if (
      mainWin &&
      !mainWin.isDestroyed() &&
      commandPalette &&
      !quickList.isVisible
    ) {
      commandPalette.toggle();
    }
  });
  globalShortcut.register("CommandOrControl+U", () => {
    // actually l
    if (mainWin && !mainWin.isDestroyed() && quickList) {
      quickList.addCurrentLink();
    }
  });

  globalShortcut.register("CommandOrControl+/", () => {
    if (
      mainWin &&
      !mainWin.isDestroyed() &&
      quickList &&
      !commandPalette.isVisible
    ) {
      quickList.toggle();
    }
  });
}

function unregisterKeyboardShortcuts() {
  globalShortcut.unregisterAll();
}

function performClose() {
  if (watcher) watcher.close();
  unregisterKeyboardShortcuts();
  app.quit();
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
  performClose();
});

app.on("activate", () => {
  if (!mainWin) createWindow();
});

app.on("will-quit", () => {
  unregisterKeyboardShortcuts();
});

// -------------------- IPC --------------------

ipcMain.on("close-window", () => {
  performClose();
});

ipcMain.on("load-new-pdf", (_event, newPath) => {
  if (typeof newPath !== "string" || !newPath.trim()) return;
  const abs = path.resolve(newPath.trim());
  if (!fs.existsSync(abs)) return;

  filePath = abs;
  ensurePdfTabLoaded(abs);
  watchFile(abs);
  sendToPdfView("load-pdf", abs);
});

ipcMain.on("load-new-md", (_event, newPath) => {
  if (typeof newPath !== "string" || !newPath.trim()) return;
  const abs = path.resolve(newPath.trim());
  if (!fs.existsSync(abs)) return;

  filePath = abs;
  ensureMarkdownTabLoaded(abs);
  watchFile(abs);
  sendToMarkdownView("load-md", abs);
});

ipcMain.handle("read-file", async (_evt, filePath) => {
  const buf = await fsp.readFile(filePath);
  return buf.toString("utf8");
});
