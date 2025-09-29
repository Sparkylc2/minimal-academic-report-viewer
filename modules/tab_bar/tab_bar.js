const { WebContentsView } = require("electron");
const path = require("path");

class TabBar {
  constructor(mainWin, tabManager, isHighDPI, config) {
    this.mainWin = mainWin;
    this.tabManager = tabManager;
    this.view = null;
    this.height = config?.margins?.height || (isHighDPI ? 32 : 16);

    this.create();
  }

  create() {
    this.view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, "preload.js"),
        backgroundThrottling: false,
      },
    });

    try {
      this.view.webContents.setBackgroundColor("#181616");
    } catch {}

    const tabBarPath = path.join(__dirname, "tab_bar.html");
    this.view.webContents.loadFile(tabBarPath);

    this.updateBounds();

    this.tabManager.on("tabs-changed", () => {
      this.updateTabs();
    });

    this.setupIPC();
  }

  setupIPC() {
    const { ipcMain } = require("electron");

    ipcMain.on("tab-switch", (_event, tabId) => {
      this.tabManager.switchToTab(tabId);
    });

    ipcMain.on("tab-close", (_event, tabId) => {
      this.tabManager.closeTab(tabId);
    });

    ipcMain.on("tab-new", () => {
      const commandPalette = this.mainWin.commandPalette;
      if (commandPalette) {
        commandPalette.show();
      }
    });
  }

  updateBounds() {
    const { width } = this.mainWin.getContentBounds();
    this.view.setBounds({
      x: 0,
      y: 0,
      width: width,
      height: this.height,
    });
  }

  updateTabs() {
    const tabs = this.tabManager.getAllTabs();
    const activeId = this.tabManager.activeTab;

    if (this.view && !this.view.webContents.isDestroyed()) {
      this.view.webContents.send("tabs-update", {
        tabs: tabs,
        activeId: activeId,
      });
    }
  }

  show() {
    if (this.view) {
      this.mainWin.contentView.addChildView(this.view);
      this.updateBounds();
    }
  }

  hide() {
    if (this.view) {
      this.mainWin.contentView.removeChildView(this.view);
    }
  }
}

module.exports = TabBar;
