const { WebContentsView } = require("electron");
const path = require("path");
const { getEventBus } = require("../event_bus");

class TabBar {
  constructor(mainWin, tabManager, isHighDPI, tabConfig) {
    this.bus = getEventBus();
    this.mainWin = mainWin;
    this.tabManager = tabManager;
    this.aiChat = null;
    this.view = null;
    this.visible = tabConfig.show;

    this.height = tabConfig.height || (isHighDPI ? 32 : 16);

    this.create();

    if (tabConfig.show) this.hide();
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

    this.bus.on("tab-bar:tabs-changed", () => {
      this.updateTabs();
    });
    // this.tabManager.on("tabs-changed", () => {
    //   this.updateTabs();
    // });
    this.bus.on("tab-bar:toggle", () => {
      this.toggle();
    });

    // this.tabManager.on("toggle-tab-bar", () => {
    //   console.log("receiving toggle");
    //   this.toggle();
    // });

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

  toggle() {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  show() {
    if (this.view) {
      this.visible = true;
      this.mainWin.contentView.addChildView(this.view);
      this.updateBounds();
    }
  }

  hide() {
    if (this.view) {
      this.visible = false;
      this.mainWin.contentView.removeChildView(this.view);
    }
  }
}

module.exports = TabBar;
