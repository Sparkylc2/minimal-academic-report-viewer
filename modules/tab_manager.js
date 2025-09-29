const { WebContentsView, View } = require("electron");
const path = require("path");

class TabManager {
  constructor(mainWin, config) {
    this.mainWin = mainWin;
    this.config = config || {
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
    };
    this.tabs = new Map();
    this.activeTab = null;
    this.nextId = 1;

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
      bottom = 0,
      left = 0,
    } = this.config.margins || {};

    this.insetView.setBounds({
      x: left,
      y: top,
      width: Math.max(0, width - left - right),
      height: Math.max(0, height - top - bottom),
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

  getFirstPdfTab() {
    for (const [id, tab] of this.tabs) {
      if (tab.type === "pdf") return id;
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
      },
    });

    try {
      view.webContents.setBackgroundColor("#00000000");
    } catch {}

    view.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
    if (view.webContents.setLayoutZoomLevelLimits) {
      view.webContents.setLayoutZoomLevelLimits(0, 0);
    }

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

    const viewerPath = path.join(__dirname, "pdf_viewer", "viewer.html");
    view.webContents.loadFile(viewerPath);
    view.webContents.on("did-finish-load", () => {
      view.webContents.send("viewer-config", this.config);
      view.webContents.send("load-pdf", pdfPath);
    });

    this.switchToTab(id);
    return tab;
  }

  getLastWebTab() {
    let lastWebId = null;
    for (const [id, tab] of this.tabs) if (tab.type === "web") lastWebId = id;
    return lastWebId;
  }

  getOrCreateWebTab(url) {
    const id = this.nextId++;

    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, "../preload.js"),
        backgroundThrottling: false,
        webSecurity: true,
      },
    });

    const tab = {
      id,
      view,
      type: "web",
      title: "",
      target: url,
      history: [url],
      historyIndex: 0,
    };

    this.tabs.set(id, tab);

    view.webContents.loadURL(url);

    view.webContents.on("page-title-updated", (_e, title) => {
      tab.title = title;
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
        html { border-radius: 16px !important; overflow: hidden !important; }
        body { border-radius: 16px !important; }
      `);

      view.webContents.executeJavaScript(`
        (function() {
          let baseSpeed = 200;
          let shiftMultiplier = 3;
          let isInputFocused = false;
          function checkInputFocus() {
            const a = document.activeElement;
            const tag = a ? a.tagName.toLowerCase() : '';
            const edit = a ? a.isContentEditable : false;
            isInputFocused = (tag === 'input' || tag === 'textarea' || tag === 'select' || edit);
          }
          document.addEventListener('focusin', checkInputFocus);
          document.addEventListener('focusout', () => setTimeout(checkInputFocus, 0));

          document.addEventListener('keydown', (e) => {
            checkInputFocus();
            if (isInputFocused || e.metaKey || e.ctrlKey || e.altKey) return;
            const speed = e.shiftKey ? baseSpeed * shiftMultiplier : baseSpeed;
            switch (e.key.toLowerCase()) {
              case 'h': e.preventDefault(); window.scrollBy({ left: -speed, behavior: e.shiftKey ? 'instant' : 'smooth' }); break;
              case 'j': e.preventDefault(); window.scrollBy({ top:  speed, behavior: e.shiftKey ? 'instant' : 'smooth' }); break;
              case 'k': e.preventDefault(); window.scrollBy({ top: -speed, behavior: e.shiftKey ? 'instant' : 'smooth' }); break;
              case 'l': e.preventDefault(); window.scrollBy({ left:  speed, behavior: e.shiftKey ? 'instant' : 'smooth' }); break;
              case 'g':
                e.preventDefault();
                if (!e.shiftKey) window.scrollTo(0, 0);
                else window.scrollTo(0, document.body.scrollHeight);
                break;
            }
          });

          document.addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              const delta = e.deltaY > 0 ? 0.9 : 1.1;
              const currentZoom = parseFloat(document.body.style.zoom) || 1;
              document.body.style.zoom = currentZoom * delta;
            }
          }, { passive: false });
        })();
      `);
    });

    this.switchToTab(id);
    return tab;
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

    this.activeTab = id;
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
