const { BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { default: Store } = require("electron-store");

class QuickList {
  constructor(parentWindow, tabManager, viewerConfig) {
    this.parentWin = parentWindow;
    this.tabManager = tabManager;
    this.listWin = null;
    this.isVisible = false;

    this.height = 500;
    this.config = viewerConfig;
    this.widthPercent = viewerConfig.widthPercent || 0.95;

    this.store = new Store({
      name: "quicklist-data",
      encryptionKey: "quicklist-secure-key",
    });

    this.deletedInSession = false;
    this.deletedTitles = [];

    this.currentContext = "general";

    this.setupIPC();
  }

  create() {
    if (this.listWin && !this.listWin.isDestroyed()) return;

    const parent = this.parentWin.getBounds();
    const width = Math.min(parent.width * this.widthPercent, 600);

    this.listWin = new BrowserWindow({
      parent: this.parentWin,
      modal: false,
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      hasShadow: false,
      roundedCorners: true,
      width,
      height: this.height,
      x: Math.round(parent.x + (parent.width - width) / 2),
      y: Math.round(parent.y + (parent.height - this.height) / 2),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, "preload.js"),
      },
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
    });

    // this.listWin.webContents.openDevTools({ mode: "detach" });

    this.listWin.loadFile(path.join(__dirname, "quicklist.html"));

    this.listWin.on("blur", () => {
      setTimeout(() => {
        if (
          this.listWin &&
          !this.listWin.isDestroyed() &&
          !this.listWin.isFocused()
        ) {
          this.hide();
        }
      }, 100);
    });

    this.parentWin.on("move", () => {
      this._moveCallback()();
    });

    this.parentWin.on("resize", () => {
      this._resizeCallback()();
    });

    this._resizeCallback()();
  }

  _resizeCallback() {
    return () => {
      if (this.listWin && !this.listWin.isDestroyed()) {
        const p = this.parentWin.getBounds();
        const w = Math.min(p.width * this.widthPercent, 600);
        this.listWin.setBounds({
          width: w,
          height: this.height,
          x: Math.round(p.x + (p.width - w) / 2),
          y: Math.round(p.y + (p.height - this.height) / 2),
        });
      }
    };
  }

  _moveCallback() {
    return () => {
      if (this.listWin && !this.listWin.isDestroyed()) {
        const p = this.parentWin.getBounds();
        const w = Math.min(p.width * this.widthPercent, 600);
        this.listWin.setBounds({
          x: Math.round(p.x + (p.width - w) / 2),
          y: Math.round(p.y + (p.height - this.height) / 2),
        });
      }
    };
  }

  setupIPC() {
    ipcMain.on("quicklist-add", (_event, _data) => {
      this.addCurrentLink();
    });

    ipcMain.on("quicklist-toggle", () => {
      this.toggle();
    });

    ipcMain.on("quicklist-get-data", (event) => {
      const data = this.getContextData();
      event.reply("quicklist-data", data);
    });

    ipcMain.on("quicklist-save", (_event, data) => {
      this.saveContextData(data.items, data.folders);
    });

    ipcMain.on("quicklist-delete", (_event, itemId) => {
      this.deletedInSession = true;
      this.deleteItem(itemId);
    });

    ipcMain.on("quicklist-rename", (_event, data) => {
      this.renameItem(data.id, data.newTitle);
    });

    ipcMain.on("quicklist-navigate", (_event, url) => {
      this.navigateToUrl(url);
      this.hide();
    });

    ipcMain.on("quicklist-close", () => {
      this.hide();
    });

    ipcMain.on("quicklist-confirm-close-result", (_event, payload) => {
      const ok = payload && payload.confirm;
      if (ok) {
        this.deletedInSession = false;
        this.deletedTitles = [];
        this.hide();
      } else {
        // keep window open
      }
    });

    ipcMain.on("quicklist-paste", (_event, targetFolderId) => {
      if (this.cutItem) {
        this.moveItem(this.cutItem, targetFolderId);
        this.cutItem = null;
      }
    });
  }

  getCurrentContext() {
    if (!this.tabManager) return "general";
    const pdfTab = Array.from(this.tabManager.tabs.values()).find(
      (tab) => tab.type === "pdf",
    );
    return pdfTab ? pdfTab.target : "general";
  }

  getContextData() {
    this.currentContext = this.getCurrentContext();
    const key = `quicklist_${this.currentContext}`;

    const defaultData = {
      items: [],
      folders: [],
      context: this.currentContext,
    };

    try {
      const data = this.store.get(key, defaultData);
      data.context = this.currentContext;
      return data;
    } catch (err) {
      console.error("Error loading quicklist data:", err);
      return defaultData;
    }
  }

  saveContextData(items, folders) {
    const key = `quicklist_${this.currentContext}`;
    try {
      this.store.set(key, {
        items: items || [],
        folders: folders || [],
        lastModified: Date.now(),
      });
    } catch (err) {
      console.error("Error saving quicklist data:", err);
    }
  }

  addCurrentLink() {
    if (!this.tabManager || !this.tabManager.activeTab) return;

    const activeTab = this.tabManager.tabs.get(this.tabManager.activeTab);
    if (!activeTab || activeTab.type !== "web") return;

    const url = activeTab.view.webContents.getURL();
    const title = activeTab.view.webContents.getTitle() || url;

    const data = this.getContextData();

    const newItem = {
      id: Date.now().toString(),
      url: url,
      title: title,
      createdAt: Date.now(),
      folderId: null,
    };

    data.items.push(newItem);

    this.saveContextData(data.items, data.folders);

    if (this.listWin && !this.listWin.isDestroyed()) {
      this.listWin.webContents.send("quicklist-refresh", data);
    }
  }

  deleteItem(itemId) {
    const data = this.getContextData();

    const toDelete = data.items.find((item) => item.id === itemId);
    if (toDelete && toDelete.title) {
      this.deletedTitles.push(toDelete.title);
    }

    data.items = data.items.filter((item) => item.id !== itemId);
    this.saveContextData(data.items, data.folders);

    if (this.listWin && !this.listWin.isDestroyed()) {
      this.listWin.webContents.send("quicklist-refresh", data);
    }
  }

  renameItem(itemId, newTitle) {
    const data = this.getContextData();
    const item = data.items.find((i) => i.id === itemId);
    if (item) {
      item.title = newTitle;
      this.saveContextData(data.items, data.folders);

      if (this.listWin && !this.listWin.isDestroyed()) {
        this.listWin.webContents.send("quicklist-refresh", data);
      }
    }
  }

  navigateToUrl(url) {
    if (!this.tabManager) return;

    const lastWebId = this.tabManager.getLastWebTab();
    if (lastWebId) {
      this.tabManager.switchToTab(lastWebId);
      const tab = this.tabManager.tabs.get(lastWebId);
      if (tab && tab.view) {
        tab.view.webContents.loadURL(url);
      }
    } else {
      this.tabManager.createWebTab(url);
    }
  }

  show() {
    if (!this.listWin) this.create();
    if (this.listWin.isDestroyed()) {
      this.listWin = null;
      this.create();
    }

    this.isVisible = true;
    this.listWin.show();
    this.listWin.focus();

    const data = this.getContextData();
    // Include config so renderer can use it (no exposeInMainWorld needed)
    this.listWin.webContents.send("quicklist-show", {
      ...data,
      config: this.config || {},
    });
  }

  hide() {
    if (this.listWin && !this.listWin.isDestroyed()) {
      this.isVisible = false;
      this.listWin.hide();
      this.parentWin.focus();
    }
  }

  toggle() {
    if (this.isVisible) {
      if (this.deletedInSession && this.deletedTitles.length > 0) {
        if (this.listWin && !this.listWin.isDestroyed()) {
          this.listWin.webContents.send(
            "quicklist-confirm-close",
            this.deletedTitles.slice(0),
          );
        }
        return;
      }
      this.hide();
    } else {
      this.show();
    }
  }

  destroy() {
    if (this.listWin && !this.listWin.isDestroyed()) {
      this.listWin.destroy();
    }
    this.listWin = null;
  }
}

module.exports = QuickList;
