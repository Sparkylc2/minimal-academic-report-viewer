const { WebContentsView, View } = require("electron");
const path = require("path");
const EventEmitter = require("events");

class TabManager extends EventEmitter {
  constructor(mainWin, config) {
    super();
    this.mainWin = mainWin;
    this.config = config || {
      margins: { top: 36, right: 0, bottom: 0, left: 0 },
    };
    this.tabs = new Map();
    this.tabOrder = [];
    this.activeTab = null;
    this.nextId = 1;
    this.closedTabs = [];
    this.maxClosedTabs = 30;

    this.insetView = new View();
    this.mainWin.contentView.addChildView(this.insetView);

    this.mainWin.on("resize", () => {
      this._layoutInsetView();
      if (this.activeTab) {
        const tab = this.tabs.get(this.activeTab);
        if (tab) this._fitTabToInset(tab.view);
      }
    });

    this._layoutInsetView();
  }

  // ---- layout helpers -------------------------------------------------------

  _layoutInsetView() {
    const { width, height } = this.mainWin.getContentBounds();
    const {
      top = 0,
      right = 0,
      bottom = 16,
      left = 0,
    } = this.config.margins || {};

    this.insetView.setBounds({
      x: left,
      y: top,
      width: Math.max(0, width - left - right),
      height: Math.max(0, height - bottom - top),
    });
  }

  _fitTabToInset(view) {
    const insetBounds = this.insetView.getBounds();
    view.setBounds({
      x: 0,
      y: 0,
      width: insetBounds.width,
      height: insetBounds.height,
    });
  }

  // ---- public API -----------------------------------------------------------

  setBounds(_view) {
    this._layoutInsetView();
    if (_view) this._fitTabToInset(_view);
  }

  getAllTabs() {
    return this.tabOrder.map((id) => {
      const tab = this.tabs.get(id);
      return {
        id: tab.id,
        type: tab.type,
        title: tab.title,
        url: tab.target,
      };
    });
  }

  getFirstPdfTab() {
    for (const id of this.tabOrder) {
      const tab = this.tabs.get(id);
      if (tab && tab.type === "pdf") return id;
    }
    return null;
  }

  getOrCreatePdfTab(pdfPath) {
    for (const [id, tab] of this.tabs) {
      if (tab.type === "pdf" && tab.target === pdfPath) {
        this.switchToTab(id);
        return tab;
      }
    }

    const id = this.nextId++;
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, "../preload.js"),
        backgroundThrottling: false,
        offscreen: false,
      },
    });
    view.webContents.openDevTools({ mode: "detach" });
    try {
      view.webContents.setBackgroundColor("#00000000");
    } catch {}

    const tab = {
      id,
      view,
      type: "pdf",
      title: path.basename(pdfPath),
      target: pdfPath,
      history: [pdfPath],
      historyIndex: 0,
    };

    this.tabs.set(id, tab);

    this.tabOrder.unshift(id);

    const viewerPath = path.join(__dirname, "pdf_viewer", "viewer.html");
    view.webContents.loadFile(viewerPath);
    view.webContents.on("did-finish-load", () => {
      view.webContents.send("viewer-config", this.config);
      view.webContents.send("load-pdf", pdfPath);
    });
    view.webContents.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown") return;

      const cmdOrCtrl =
        process.platform === "darwin" ? input.meta : input.control;
      const key = (input.key || "").toLowerCase();

      if (cmdOrCtrl && key === "t" && !input.shift) {
        event.preventDefault();
        this.mainWin.commandPalette?.show();
      } else if (cmdOrCtrl && input.shift && key === "t") {
        event.preventDefault();
        this.reopenClosedTab();
      } else if (cmdOrCtrl && key === "w") {
        event.preventDefault();
      } else if (cmdOrCtrl && key >= "1" && key <= "9") {
        event.preventDefault();
        this.switchToTabByIndex(parseInt(key, 10));
      } else if (cmdOrCtrl && key === "arrowleft") {
        event.preventDefault();
        this.navigateBack();
      } else if (cmdOrCtrl && key === "arrowright") {
        event.preventDefault();
        this.navigateForward();
      }
    });

    this.switchToTab(id);
    this.emit("tabs-changed");
    return tab;
  }

  getLastWebTab() {
    for (let i = this.tabOrder.length - 1; i >= 0; i--) {
      const tab = this.tabs.get(this.tabOrder[i]);
      if (tab && tab.type === "web") return this.tabOrder[i];
    }
    return null;
  }

  createWebTab(url) {
    const id = this.nextId++;

    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, "../preload.js"),
        backgroundThrottling: false,
        webSecurity: true,
        offscreen: false,
      },
    });

    const tab = {
      id,
      view,
      type: "web",
      title: "Loading...",
      target: url,
      history: [url],
      historyIndex: 0,
    };

    this.tabs.set(id, tab);

    const pdfIndex = this.tabOrder.findIndex((tabId) => {
      const t = this.tabs.get(tabId);
      return t && t.type === "pdf";
    });

    if (pdfIndex >= 0) {
      this.tabOrder.splice(pdfIndex + 1, 0, id);
    } else {
      this.tabOrder.push(id);
    }

    view.webContents.loadURL(url);
    view.webContents.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown") return;

      const cmdOrCtrl =
        process.platform === "darwin" ? input.meta : input.control;
      const key = (input.key || "").toLowerCase();

      if (cmdOrCtrl && key === "t" && !input.shift) {
        event.preventDefault();
        this.mainWin.commandPalette?.show();
      } else if (cmdOrCtrl && input.shift && key === "t") {
        event.preventDefault();
        this.reopenClosedTab();
      } else if (cmdOrCtrl && key === "w") {
        event.preventDefault();
        this.closeCurrentTab();
      } else if (cmdOrCtrl && key >= "1" && key <= "9") {
        event.preventDefault();
        this.switchToTabByIndex(parseInt(key, 10));
      } else if (cmdOrCtrl && key === "arrowleft") {
        event.preventDefault();
        this.navigateBack();
      } else if (cmdOrCtrl && key === "arrowright") {
        event.preventDefault();
        this.navigateForward();
      }
    });
    view.webContents.on("page-title-updated", (_e, title) => {
      tab.title = title;
      this.emit("tabs-changed");
    });

    view.webContents.on("did-navigate", (_e, newUrl) => {
      if (newUrl !== tab.history[tab.historyIndex]) {
        tab.history = tab.history.slice(0, tab.historyIndex + 1);
        tab.history.push(newUrl);
        tab.historyIndex++;
      }
    });

    view.webContents.on("did-finish-load", () => {
      view.webContents.insertCSS(`
        ::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
        * { scrollbar-width: none !important; -ms-overflow-style: none !important; }
        html { border-radius: 8px !important; overflow: auto !important; }
        body { border-radius: 8px !important; }
      `);
    });

    this.switchToTab(id);
    this.emit("tabs-changed");
    return tab;
  }

  getOrCreateWebTab(url) {
    return this.createWebTab(url);
  }

  switchToTab(id) {
    const tab = this.tabs.get(id);
    if (!tab) return;

    if (this.activeTab && this.activeTab !== id) {
      const current = this.tabs.get(this.activeTab);
      if (current && current.view) {
        this.insetView.removeChildView(current.view);
      }
    }

    this.insetView.addChildView(tab.view);
    this._fitTabToInset(tab.view);
    if (this.mainWin && !this.mainWin.isDestroyed()) {
      this.mainWin.focus();
      if (tab.view && tab.view.webContents) {
        tab.view.webContents.focus();
      }
    }
    this.activeTab = id;
    this.emit("tabs-changed");
  }

  switchToTabByIndex(index) {
    const tabId = this.tabOrder[index - 1];
    if (tabId) {
      this.switchToTab(tabId);
    }
  }

  closeTab(id) {
    const tab = this.tabs.get(id);
    if (!tab) return;

    if (tab.type === "pdf") return;

    this.closedTabs.push({
      type: tab.type,
      title: tab.title,
      url: tab.target,
      history: tab.history,
      historyIndex: tab.historyIndex,
      closedAt: Date.now(),
    });

    if (this.closedTabs.length > this.maxClosedTabs) {
      this.closedTabs.shift();
    }

    const index = this.tabOrder.indexOf(id);
    if (index > -1) {
      this.tabOrder.splice(index, 1);
    }

    if (this.activeTab === id) {
      const newIndex = Math.min(index, this.tabOrder.length - 1);
      if (this.tabOrder[newIndex]) {
        this.switchToTab(this.tabOrder[newIndex]);
      } else if (this.tabOrder.length > 0) {
        this.switchToTab(this.tabOrder[0]);
      }
    }

    if (tab.view) {
      if (this.activeTab === id) {
        this.insetView.removeChildView(tab.view);
      }
      tab.view.webContents.destroy();
    }

    this.tabs.delete(id);
    this.emit("tabs-changed");
  }

  closeCurrentTab() {
    if (this.activeTab) {
      this.closeTab(this.activeTab);
    }
  }

  reopenClosedTab() {
    if (this.closedTabs.length === 0) return;

    const closedTab = this.closedTabs.pop();

    if (closedTab.type === "web") {
      const tab = this.createWebTab(closedTab.url);
      tab.history = closedTab.history;
      tab.historyIndex = closedTab.historyIndex;
    }
  }

  navigateBack() {
    const tab = this.tabs.get(this.activeTab);
    if (!tab || tab.historyIndex <= 0) return false;
    tab.historyIndex--;
    if (tab.type === "web") {
      tab.view.webContents.loadURL(tab.history[tab.historyIndex]);
    }
    return true;
  }

  navigateForward() {
    const tab = this.tabs.get(this.activeTab);
    if (!tab || tab.historyIndex >= tab.history.length - 1) return false;
    tab.historyIndex++;
    if (tab.type === "web") {
      tab.view.webContents.loadURL(tab.history[tab.historyIndex]);
    }
    return true;
  }

  getPdfTabs() {
    const pdfs = [];
    for (const [id, tab] of this.tabs) {
      if (tab.type === "pdf")
        pdfs.push({ id, title: tab.title, path: tab.target });
    }
    return pdfs;
  }
}

module.exports = TabManager;
