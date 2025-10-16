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

const { debugLog } = require("./modules/debug");
const CommandPalette = require("./modules/command_palette/palette");
const TabManager = require("./modules/tab_manager");
const TabBar = require("./modules/tab_bar/tab_bar");
const AIChat = require("./modules/ai_chat/ai_chat");
const QuickList = require("./modules/quicklist/quicklist");
const MarkdownViewer = require("./modules/markdown_viewer/viewer");
const SessionState = require("./modules/session_state");
const WorkspaceManager = require("./modules/workspace_manager");
const WorkspaceSwitcher = require("./modules/workspace_switcher/workspace_switcher");
const ConfigManager = require("./modules/config/config_manager");

const eventBus = require("./modules/event_bus");
const ipcBridge = require("./modules/ipc_bridge");
// -------------------- argv helpers --------------------
const argv = process.argv.slice(process.defaultApp ? 2 : 1);

debugLog("args", argv);
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
function extractWorkingDir() {
  if (process.env.ARVIEW_CWD) {
    return process.env.ARVIEW_CWD;
  }
  return process.cwd();
}

// -------------------- config --------------------
const margins = {
  top: parseNumberFlag("marginTop", 16),
  right: parseNumberFlag("marginRight", 0),
  bottom: parseNumberFlag("marginBottom", 8),
  left: parseNumberFlag("marginLeft", 0),
};

let viewerConfig = null;
let config = null;
// const viewerConfig = {
//   pageGap: parseNumberFlag("pageGap", 16),
//   pageRadius: parseNumberFlag("pageRadius", 8),
//   fit: parseEnumFlag("fit", new Set(["width", "height", "auto"]), "auto"),
//   bg: parseStringFlag("bg", "#181616"),
//   margins,
//   widthPercent: Math.min(1, parseNumberFlag("widthPercent", 0.95)),
// };

function isHighDPI() {
  const scaleFactor = screen.getPrimaryDisplay().scaleFactor;
  return scaleFactor > 1;
}
// -------------------- resolve initial pdf --------------------
function resolveFileArg(args, workingDir = null) {
  const cwd = workingDir || process.cwd();

  for (const raw of args) {
    if (!raw || raw.startsWith("--")) continue;
    const a = String(raw).trim();

    if (path.isAbsolute(a) && fs.existsSync(a)) {
      const ext = path.extname(a).toLowerCase();
      if (ext === ".pdf" || ext === ".md" || ext === ".markdown") {
        return a;
      }
    }

    if (/\.(pdf|md|markdown)$/i.test(a)) {
      const resolved = path.resolve(cwd, a);
      if (fs.existsSync(resolved)) {
        return resolved;
      }
    }

    try {
      const abs = path.resolve(cwd, a);
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
  app.on("second-instance", async (_event, argv2, workingDirectory) => {
    debugLog("[main] second-instance event, args:", argv2);
    debugLog("[main] Working directory from event:", workingDirectory);

    const workingDir = workingDirectory || process.cwd();
    debugLog("[main] Using working directory:", workingDir);

    const newFile = resolveFileArg(argv2.slice(1), workingDir);
    debugLog("[main] Resolved file:", newFile);

    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.show();
      mainWin.focus();
    }

    if (newFile && fs.existsSync(newFile)) {
      const ext = path.extname(newFile).toLowerCase();
      debugLog("[main] File extension:", ext);

      if (ext === ".pdf") {
        filePath = newFile;
        debugLog("[main] Calling ensurePdfTabLoaded");
        await ensurePdfTabLoaded(newFile);
        watchFile(newFile);
        debugLog("[main] ensurePdfTabLoaded completed");
      } else if (ext === ".md" || ext === ".markdown") {
        filePath = newFile;
        debugLog("[main] Calling ensureMarkdownTabLoaded");
        await ensureMarkdownTabLoaded(newFile);
        watchFile(newFile);
        debugLog("[main] ensureMarkdownTabLoaded completed");
      }
    } else {
      debugLog("[main] File does not exist or was not resolved");
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
let sessionState = null;
let workspaceManager = null;
let workspaceSwitcher = null;
let configManager = null;

let stateBundle = null;

let filePath = null;
const initialWorkingDir = extractWorkingDir();
let initialTarget = resolveInitialTarget(argv, initialWorkingDir);
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
function resolveInitialTarget(args, workingDir = null) {
  const cwd = workingDir || process.cwd();

  for (const raw of args) {
    if (!raw || raw.startsWith("--")) continue;
    const a = String(raw).trim();

    if (a.startsWith("http://") || a.startsWith("https://")) return a;

    if (/\.(pdf|md|markdown)$/i.test(a)) {
      try {
        const abs = path.resolve(cwd, a);
        if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
      } catch (_) {}
    }
  }
  return null;
}

async function ensurePdfTabLoaded(targetPath) {
  if (!tabManager || !sessionState || !workspaceManager) {
    debugLog("[main] ensurePdfTabLoaded: missing manager");
    return;
  }

  debugLog("[main] ensurePdfTabLoaded:", targetPath);

  const existingWorkspaceId =
    workspaceManager.findWorkspaceByFilePath(targetPath);

  if (existingWorkspaceId) {
    debugLog("[main] Found existing workspace:", existingWorkspaceId);
    await switchToWorkspace(existingWorkspaceId);
    return;
  }

  debugLog("[main] Creating new workspace for:", targetPath);

  try {
    const currentWorkspace = workspaceManager.getActiveWorkspace();
    if (currentWorkspace) {
      debugLog("[main] Saving current workspace state");
      const currentContext = sessionState.getContextKey(tabManager);
      await sessionState.saveState(tabManager, currentContext);

      const savedState = sessionState.loadState(currentContext);
      workspaceManager.updateWorkspace(
        workspaceManager.activeWorkspaceId,
        savedState,
      );
    }

    debugLog("[main] Clearing tabs, count:", tabManager.tabs.size);
    const existingTabIds = [...tabManager.tabs.keys()];
    for (const id of existingTabIds) {
      const tab = tabManager.tabs.get(id);
      if (tab && tab.view) {
        try {
          tabManager.insetView.removeChildView(tab.view);
          if (!tab.view.webContents.isDestroyed()) {
            tab.view.webContents.destroy();
          }
        } catch (err) {
          console.error("[main] Error removing tab view:", err);
        }
      }
    }
    tabManager.tabs.clear();
    tabManager.tabOrder = [];
    tabManager.activeTab = null;
    tabManager.emit("tabs-changed");

    debugLog("[main] Tabs cleared");

    const savedState = sessionState.loadState(targetPath);

    const newWorkspaceId = workspaceManager.createWorkspace(
      targetPath,
      "pdf",
      savedState,
    );
    debugLog("[main] Created new workspace:", newWorkspaceId);

    if (savedState && savedState.tabs) {
      debugLog(
        "[main] Restoring saved state with",
        savedState.tabs.length,
        "tabs",
      );
      await restoreSessionState(savedState, targetPath, "pdf");
    } else {
      debugLog("[main] No saved state, creating fresh PDF tab");
      tabManager.getOrCreatePdfTab(targetPath);
    }

    await updateCurrentWorkspaceState();

    updateQuickListContext();
  } catch (err) {
    console.error("[main] Error in ensurePdfTabLoaded:", err);
  }
}

async function ensureMarkdownTabLoaded(targetPath) {
  if (!tabManager || !sessionState || !workspaceManager) {
    debugLog("[main] ensureMarkdownTabLoaded: missing manager");
    return;
  }

  debugLog("[main] ensureMarkdownTabLoaded:", targetPath);

  const existingWorkspaceId =
    workspaceManager.findWorkspaceByFilePath(targetPath);

  if (existingWorkspaceId) {
    debugLog("[main] Found existing workspace:", existingWorkspaceId);
    await switchToWorkspace(existingWorkspaceId);
    return;
  }

  debugLog("[main] Creating new workspace for:", targetPath);

  try {
    const currentWorkspace = workspaceManager.getActiveWorkspace();
    if (currentWorkspace) {
      debugLog("[main] Saving current workspace state");
      const currentContext = sessionState.getContextKey(tabManager);
      await sessionState.saveState(tabManager, currentContext);

      const savedState = sessionState.loadState(currentContext);
      workspaceManager.updateWorkspace(
        workspaceManager.activeWorkspaceId,
        savedState,
      );
    }

    debugLog("[main] Clearing tabs, count:", tabManager.tabs.size);
    const existingTabIds = [...tabManager.tabs.keys()];
    for (const id of existingTabIds) {
      const tab = tabManager.tabs.get(id);
      if (tab && tab.view) {
        try {
          tabManager.insetView.removeChildView(tab.view);
          if (!tab.view.webContents.isDestroyed()) {
            tab.view.webContents.destroy();
          }
        } catch (err) {
          console.error("[main] Error removing tab view:", err);
        }
      }
    }
    tabManager.tabs.clear();
    tabManager.tabOrder = [];
    tabManager.activeTab = null;
    tabManager.emit("tabs-changed");

    debugLog("[main] Tabs cleared");

    const savedState = sessionState.loadState(targetPath);

    const newWorkspaceId = workspaceManager.createWorkspace(
      targetPath,
      "markdown",
      savedState,
    );
    debugLog("[main] Created new workspace:", newWorkspaceId);

    if (savedState && savedState.tabs) {
      debugLog(
        "[main] Restoring saved state with",
        savedState.tabs.length,
        "tabs",
      );
      await restoreSessionState(savedState, targetPath, "markdown");
    } else {
      debugLog("[main] No saved state, creating fresh Markdown tab");
      tabManager.getOrCreateMarkdownTab(targetPath);
    }

    await updateCurrentWorkspaceState();

    updateQuickListContext();
  } catch (err) {
    console.error("[main] Error in ensureMarkdownTabLoaded:", err);
  }
}
async function updateCurrentWorkspaceState() {
  if (!workspaceManager || !sessionState || !tabManager) return;

  const currentWorkspace = workspaceManager.getActiveWorkspace();
  if (!currentWorkspace) return;

  await new Promise((resolve) => setTimeout(resolve, 100));

  const currentContext = sessionState.getContextKey(tabManager);
  await sessionState.saveState(tabManager, currentContext);

  const savedState = sessionState.loadState(currentContext);
  workspaceManager.updateWorkspace(
    workspaceManager.activeWorkspaceId,
    savedState,
  );

  debugLog(
    "[main] Updated workspace state, tab count:",
    savedState?.tabs?.length || 0,
  );
}
async function switchToWorkspace(workspaceId) {
  if (!workspaceManager || !tabManager || !sessionState) return;

  debugLog("[main] Switching to workspace:", workspaceId);

  try {
    const currentWorkspace = workspaceManager.getActiveWorkspace();
    if (currentWorkspace) {
      const currentContext = sessionState.getContextKey(tabManager);
      await sessionState.saveState(tabManager, currentContext);

      const savedState = sessionState.loadState(currentContext);
      workspaceManager.updateWorkspace(
        workspaceManager.activeWorkspaceId,
        savedState,
      );
    }

    debugLog(
      "[main] Clearing tabs for workspace switch, count:",
      tabManager.tabs.size,
    );
    const existingTabIds = [...tabManager.tabs.keys()];
    for (const id of existingTabIds) {
      const tab = tabManager.tabs.get(id);
      if (tab && tab.view) {
        try {
          tabManager.insetView.removeChildView(tab.view);
          if (!tab.view.webContents.isDestroyed()) {
            tab.view.webContents.destroy();
          }
        } catch (err) {
          console.error("[main] Error removing tab view:", err);
        }
      }
    }
    tabManager.tabs.clear();
    tabManager.tabOrder = [];
    tabManager.activeTab = null;
    tabManager.emit("tabs-changed");

    workspaceManager.switchToWorkspace(workspaceId);

    const workspace = workspaceManager.getWorkspace(workspaceId);
    if (!workspace) {
      debugLog("[main] Workspace not found:", workspaceId);
      return;
    }

    debugLog("[main] Loading workspace:", workspace.filePath);

    filePath = workspace.filePath;
    watchFile(workspace.filePath);

    const savedState = sessionState.loadState(workspace.filePath);

    if (savedState && savedState.tabs) {
      debugLog(
        "[main] Restoring saved state with",
        savedState.tabs.length,
        "tabs",
      );
      await restoreSessionState(
        savedState,
        workspace.filePath,
        workspace.fileType,
      );
    } else {
      debugLog("[main] No saved state, creating fresh tab");
      if (workspace.fileType === "pdf") {
        tabManager.getOrCreatePdfTab(workspace.filePath);
      } else {
        tabManager.getOrCreateMarkdownTab(workspace.filePath);
      }
    }

    await updateCurrentWorkspaceState();

    updateQuickListContext();
  } catch (err) {
    console.error("[main] Error in switchToWorkspace:", err);
  }
}

async function deleteWorkspace(workspaceId) {
  if (!workspaceManager) return;

  const success = workspaceManager.deleteWorkspace(workspaceId);

  if (success) {
    const newActiveWorkspace = workspaceManager.getActiveWorkspace();
    if (newActiveWorkspace) {
      await switchToWorkspace(newActiveWorkspace.id);
    }
  }

  if (workspaceSwitcher && workspaceSwitcher.isVisible) {
    const workspaces = workspaceManager.getAllWorkspaces();
    workspaceSwitcher.switcherWin.webContents.send(
      "workspace-switcher-refresh",
      {
        workspaces,
      },
    );
  }
}

function updateQuickListContext() {
  if (
    quickList &&
    quickList.listWin &&
    !quickList.listWin.isDestroyed() &&
    quickList.isVisible
  ) {
    const data = quickList.getContextData();
    quickList.listWin.webContents.send("quicklist-show", {
      ...data,
      config: quickList.config || {},
    });
  }
}

async function restoreSessionState(state, mainFilePath, mainFileType) {
  if (!state || !state.tabs || !tabManager) return;

  const existingTabIds = [...tabManager.tabs.keys()];
  for (const id of existingTabIds) {
    const tab = tabManager.tabs.get(id);
    if (tab && (tab.type === "pdf" || tab.type === "markdown")) {
      tabManager.closeTab(id);
    }
  }

  for (let i = 0; i < state.tabs.length; i++) {
    const tabData = state.tabs[i];

    if (tabData.type === "pdf" && mainFileType === "pdf") {
      const tab = tabManager.getOrCreatePdfTab(mainFilePath);
      if (tab && tabData.viewState) {
        setTimeout(() => {
          if (!tab.view.webContents.isDestroyed()) {
            tab.view.webContents.send("restore-view-state", tabData.viewState);
          }
        }, 800);
      }
    } else if (tabData.type === "markdown" && mainFileType === "markdown") {
      const tab = tabManager.getOrCreateMarkdownTab(mainFilePath);
      if (tab && tabData.viewState) {
        setTimeout(() => {
          if (!tab.view.webContents.isDestroyed()) {
            tab.view.webContents.send("restore-view-state", tabData.viewState);
          }
        }, 800);
      }
    } else if (tabData.type === "web") {
      const webTab = tabManager.createWebTab(tabData.target);
      if (webTab) {
        webTab.title = tabData.title || tabData.target;
        webTab.history = tabData.history || [tabData.target];
        webTab.historyIndex = tabData.historyIndex || 0;
      }
    }
  }

  if (
    state.activeTabIndex >= 0 &&
    state.activeTabIndex < tabManager.tabOrder.length
  ) {
    const activeTabId = tabManager.tabOrder[state.activeTabIndex];
    if (activeTabId) {
      setTimeout(() => {
        tabManager.switchToTab(activeTabId);
      }, 100);
    }
  }
}

// -------------------- window & view --------------------
async function createWindow() {
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

  tabManager = new TabManager(mainWin, viewerConfig, config);
  tabManager.on("all-tabs-closed", () => performClose());

  tabBar = new TabBar(mainWin, tabManager, highDPI, config.tabs);
  tabBar.show();

  commandPalette = new CommandPalette(mainWin, tabManager, viewerConfig);
  aiChat = new AIChat(mainWin, viewerConfig);
  quickList = new QuickList(mainWin, tabManager, viewerConfig);
  markdownViewer = new MarkdownViewer(mainWin, viewerConfig);
  sessionState = new SessionState();
  workspaceManager = new WorkspaceManager();
  workspaceSwitcher = new WorkspaceSwitcher(
    mainWin,
    workspaceManager,
    viewerConfig,
  );

  quickList.parentWin.workspaceManager = workspaceManager;

  mainWin.tabManager = tabManager;
  mainWin.commandPalette = commandPalette;

  workspaceSwitcher.on("switch-workspace", async (workspaceId) => {
    await switchToWorkspace(workspaceId);
  });

  workspaceSwitcher.on("delete-workspace", async (workspaceId) => {
    await deleteWorkspace(workspaceId);
  });

  workspaceSwitcher.on("workspace-renamed", () => {
    updateQuickListContext();
  });

  stateBundle = {
    mainWin,
    commandPalette,
    tabManager,
    tabBar,
    aiChat,
    quickList,
    markdownViewer,
    sessionState,
    workspaceManager,
    workspaceSwitcher,
    configManager,
    highDPI,
    config,
    viewerConfig,
  };

  tabBar.setStateBundle(stateBundle);

  registerKeyboardShortcuts();

  if (initialTarget) {
    if (initialTarget.endsWith(".pdf")) {
      filePath = initialTarget;
      await ensurePdfTabLoaded(initialTarget);
      watchFile(initialTarget);
    } else if (
      initialTarget.endsWith(".md") ||
      initialTarget.endsWith(".markdown")
    ) {
      filePath = initialTarget;
      await ensureMarkdownTabLoaded(initialTarget);
      watchFile(initialTarget);
    } else {
      const workspaces = workspaceManager.getAllWorkspaces();
      if (workspaces.length === 0) {
        tabManager.createWebTab(initialTarget);
      }
    }
  } else {
    const workspaces = workspaceManager.getAllWorkspaces();
    if (workspaces.length > 0) {
      workspaces.sort((a, b) => b.lastAccessed - a.lastAccessed);
      await switchToWorkspace(workspaces[0].id);
    } else {
      debugLog("[main] No workspaces found and no initial target");
    }
  }
}

function registerKeyboardShortcuts() {
  globalShortcut.register("CommandOrControl+R", () => {
    if (
      mainWin &&
      !mainWin.isDestroyed() &&
      commandPalette &&
      !quickList.isVisible &&
      (!workspaceSwitcher || !workspaceSwitcher.isVisible)
    ) {
      commandPalette.toggle();
    }
  });

  globalShortcut.register("CommandOrControl+U", () => {
    if (mainWin && !mainWin.isDestroyed() && quickList) {
      quickList.addCurrentLink();
    }
  });

  globalShortcut.register("CommandOrControl+/", () => {
    if (
      mainWin &&
      !mainWin.isDestroyed() &&
      quickList &&
      !commandPalette.isVisible &&
      (!workspaceSwitcher || !workspaceSwitcher.isVisible)
    ) {
      quickList.toggle();
    }
  });
  //
  // globalShortcut.register("CommandOrControl+Shift+.", () => {
  //   if (mainWin && !mainWin.isDestroyed() && tabBar) {
  //     tabBar.toggle();
  //   }
  // });

  globalShortcut.register("CommandOrControl+Shift+/", () => {
    if (
      mainWin &&
      !mainWin.isDestroyed() &&
      workspaceSwitcher &&
      !commandPalette.isVisible &&
      !quickList.isVisible
    ) {
      workspaceSwitcher.toggle();
    }
  });

  // for (let i = 1; i <= 9; i++) {
  //   globalShortcut.register(`CommandOrControl+Shift+${i}`, () => {
  //     if (workspaceManager) {
  //       const workspaces = workspaceManager.getAllWorkspaces();
  //       workspaces.sort((a, b) => b.lastAccessed - a.lastAccessed);
  //       if (workspaces[i - 1]) {
  //         switchToWorkspace(workspaces[i - 1].id);
  //       }
  //     }
  //   });
  // }
}

function unregisterKeyboardShortcuts() {
  globalShortcut.unregisterAll();
}

async function performClose() {
  debugLog("[main] performClose called");

  if (sessionState && tabManager && workspaceManager) {
    const currentWorkspace = workspaceManager.getActiveWorkspace();
    if (currentWorkspace) {
      const currentContext = sessionState.getContextKey(tabManager);
      debugLog("[main] Saving state for context:", currentContext);
      try {
        await sessionState.saveState(tabManager, currentContext);
        debugLog("[main] State saved successfully");

        const savedState = sessionState.loadState(currentContext);
        workspaceManager.updateWorkspace(
          workspaceManager.activeWorkspaceId,
          savedState,
        );
      } catch (err) {
        console.error("[main] Error saving state:", err);
      }
    }
  }

  if (watcher) watcher.close();
  unregisterKeyboardShortcuts();

  debugLog("[main] Quitting app");
  app.quit();
}

// -------------------- app lifecycle --------------------
app.whenReady().then(async () => {
  configManager = new ConfigManager();
  await configManager.init();

  config = configManager.config;

  highDPI = isHighDPI();
  if (highDPI) {
    Object.keys(config.appearance.margins).forEach((k) => {
      config.appearance.margins[k] = Math.round(
        config.appearance.margins[k] * 2,
      );
    });
  }

  viewerConfig = {
    pageGap: config.appearance.pageGap,
    pageRadius: config.appearance.pageRadius,
    fit: config.pdfViewer.defaultFit,
    bg: config.appearance.background,
    margins: config.appearance.margins,
    widthPercent: config.appearance.widthPercent,
  };

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

app.on("window-all-closed", async () => {
  debugLog("[main] window-all-closed event");
  await performClose();
});

app.on("activate", () => {
  if (!mainWin) createWindow();
});

app.on("will-quit", async (e) => {
  debugLog("[main] will-quit event");
  e.preventDefault();

  if (sessionState && tabManager && workspaceManager) {
    const currentWorkspace = workspaceManager.getActiveWorkspace();
    if (currentWorkspace) {
      const currentContext = sessionState.getContextKey(tabManager);
      debugLog("[main] will-quit: Saving state for context:", currentContext);
      try {
        await sessionState.saveState(tabManager, currentContext);
        debugLog("[main] will-quit: State saved successfully");

        const savedState = sessionState.loadState(currentContext);
        workspaceManager.updateWorkspace(
          workspaceManager.activeWorkspaceId,
          savedState,
        );
      } catch (err) {
        console.error("[main] will-quit: Error saving state:", err);
      }
    }
  }

  unregisterKeyboardShortcuts();
  app.exit(0);
});

app.on("before-quit", async (e) => {
  debugLog("[main] before-quit event");
  e.preventDefault();

  if (sessionState && tabManager && workspaceManager) {
    const currentWorkspace = workspaceManager.getActiveWorkspace();
    if (currentWorkspace) {
      const currentContext = sessionState.getContextKey(tabManager);
      debugLog("[main] before-quit: Saving state for context:", currentContext);
      try {
        await sessionState.saveState(tabManager, currentContext);
        debugLog("[main] before-quit: State saved successfully");

        const savedState = sessionState.loadState(currentContext);
        workspaceManager.updateWorkspace(
          workspaceManager.activeWorkspaceId,
          savedState,
        );
      } catch (err) {
        console.error("[main] before-quit: Error saving state:", err);
      }
    }
  }

  app.exit(0);
});

// -------------------- IPC --------------------

ipcMain.on("close-window", () => {
  performClose();
});

ipcMain.on("load-new-pdf", async (_event, newPath) => {
  if (typeof newPath !== "string" || !newPath.trim()) return;
  const abs = path.resolve(newPath.trim());
  if (!fs.existsSync(abs)) return;

  filePath = abs;
  await ensurePdfTabLoaded(abs);
  watchFile(abs);
});

ipcMain.on("load-new-md", async (_event, newPath) => {
  if (typeof newPath !== "string" || !newPath.trim()) return;
  const abs = path.resolve(newPath.trim());
  if (!fs.existsSync(abs)) return;

  filePath = abs;
  await ensureMarkdownTabLoaded(abs);
  watchFile(abs);
});

ipcMain.handle("read-file", async (_evt, filePath) => {
  const buf = await fsp.readFile(filePath);
  return buf.toString("utf8");
});
