const { BrowserWindow, ipcMain } = require("electron");
const path = require("path");

class CommandPalette {
  constructor(parentWindow, tabManager) {
    this.parentWin = parentWindow;
    this.paletteWin = null;
    this.isVisible = false;
    this.tabManager = tabManager;
    this.setupIPC();
  }

  create() {
    if (this.paletteWin) return;

    const parent = this.parentWin.getBounds();
    const width = 600;
    const height = 60;

    this.paletteWin = new BrowserWindow({
      parent: this.parentWin,
      modal: false,
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      hasShadow: false,
      roundedCorners: true,
      width,
      height,
      x: Math.round(parent.x + (parent.width - width) / 2),
      y: Math.round(parent.y + 120),
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

    this.paletteWin.loadFile(path.join(__dirname, "palette.html"));

    this.paletteWin.on("blur", () => {
      this.hide();
    });

    this.parentWin.on("move", () => {
      if (this.paletteWin && !this.paletteWin.isDestroyed()) {
        const p = this.parentWin.getBounds();
        this.paletteWin.setBounds({
          x: Math.round(p.x + (p.width - width) / 2),
          y: Math.round(p.y + 120),
        });
      }
    });
  }

  setupIPC() {
    ipcMain.on("palette-execute", (_event, query) => {
      this.executeCommand(query);
      this.hide();
    });

    ipcMain.on("palette-cancel", () => {
      this.hide();
    });

    ipcMain.on("palette-input-changed", (_event, value) => {});

    ipcMain.on("palette-tab-command", (_event, command, data) => {
      this.handleTabCommand(command, data);
    });
  }

  handleTabCommand(command, data) {
    if (!this.tabManager) return;

    switch (command) {
      case "pdf-switch":
        const firstPdfId = this.tabManager.getFirstPdfTab();
        if (firstPdfId) {
          this.tabManager.switchToTab(firstPdfId);
        }
        this.hide();
        break;
      case "web-switch":
        const lastWebId = this.tabManager.getLastWebTab();
        if (lastWebId) {
          this.tabManager.switchToTab(lastWebId);
        } else {
          this.tabManager.createWebTab("https://google.com");
        }
        this.hide();
        break;
      case "back":
        this.tabManager.navigateBack();
        this.hide();
        break;
      case "forward":
        this.tabManager.navigateForward();
        this.hide();
        break;
    }
  }

  executeCommand(query) {
    if (!query || !query.trim()) return;

    const q = query.trim();

    if (q.startsWith(":")) {
      this.handleInternalCommand(q.substring(1));
      return;
    }

    if (q.startsWith("http://") || q.startsWith("https://")) {
      this.createNewTabWithUrl(q);
    } else if (q.includes(".") && !q.includes(" ")) {
      this.createNewTabWithUrl(`https://${q}`);
    } else {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
      this.navigateToUrl(searchUrl);
    }
  }

  createNewTabWithUrl(url) {
    if (this.tabManager) {
      this.tabManager.createWebTab(url);
    }
  }

  show() {
    if (!this.paletteWin) this.create();
    if (this.paletteWin.isDestroyed()) {
      this.paletteWin = null;
      this.create();
    }

    this.isVisible = true;
    this.paletteWin.show();
    this.paletteWin.focus();
    this.paletteWin.webContents.send("palette-show");
  }

  hide() {
    if (this.paletteWin && !this.paletteWin.isDestroyed()) {
      this.isVisible = false;
      this.paletteWin.hide();
      this.parentWin.focus();
      this.paletteWin.webContents.send("palette-hide");
    }
  }

  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  destroy() {
    if (this.paletteWin && !this.paletteWin.isDestroyed()) {
      this.paletteWin.destroy();
    }
    this.paletteWin = null;
  }
}

module.exports = CommandPalette;
