const { BrowserWindow, ipcMain } = require("electron");
const path = require("path");

class WorkspaceSwitcher {
  constructor(parentWindow, workspaceManager, viewerConfig) {
    this.parentWin = parentWindow;
    this.workspaceManager = workspaceManager;
    this.switcherWin = null;
    this.isVisible = false;

    this.height = 500;
    this.config = viewerConfig;
    this.widthPercent = viewerConfig.widthPercent || 0.95;

    this.setupIPC();
  }

  create() {
    if (this.switcherWin && !this.switcherWin.isDestroyed()) return;

    const parent = this.parentWin.getBounds();
    const width = Math.min(parent.width * this.widthPercent, 600);

    this.switcherWin = new BrowserWindow({
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

    this.switcherWin.loadFile(path.join(__dirname, "workspace_switcher.html"));

    this.switcherWin.on("blur", () => {
      setTimeout(() => {
        if (
          this.switcherWin &&
          !this.switcherWin.isDestroyed() &&
          !this.switcherWin.isFocused()
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
      if (this.switcherWin && !this.switcherWin.isDestroyed()) {
        const p = this.parentWin.getBounds();
        const w = Math.min(p.width * this.widthPercent, 600);
        this.switcherWin.setBounds({
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
      if (this.switcherWin && !this.switcherWin.isDestroyed()) {
        const p = this.parentWin.getBounds();
        const w = Math.min(p.width * this.widthPercent, 600);
        this.switcherWin.setBounds({
          x: Math.round(p.x + (p.width - w) / 2),
          y: Math.round(p.y + (p.height - this.height) / 2),
        });
      }
    };
  }

  setupIPC() {
    ipcMain.on("workspace-switcher-get-data", (event) => {
      const workspaces = this.workspaceManager.getAllWorkspaces();
      event.reply("workspace-switcher-refresh", { workspaces });
    });

    ipcMain.on("workspace-switcher-switch", (_event, workspaceId) => {
      this.emit("switch-workspace", workspaceId);
      this.hide();
    });

    ipcMain.on("workspace-switcher-delete", (_event, workspaceId) => {
      this.emit("delete-workspace", workspaceId);
    });

    ipcMain.on("workspace-switcher-rename", (_event, data) => {
      this.workspaceManager.renameWorkspace(data.id, data.newName);
      const workspaces = this.workspaceManager.getAllWorkspaces();
      if (this.switcherWin && !this.switcherWin.isDestroyed()) {
        this.switcherWin.webContents.send("workspace-switcher-refresh", {
          workspaces,
        });
      }
      this.emit("workspace-renamed");
    });

    ipcMain.on("workspace-switcher-close", () => {
      this.hide();
    });
  }

  show() {
    if (!this.switcherWin) this.create();
    if (this.switcherWin.isDestroyed()) {
      this.switcherWin = null;
      this.create();
    }

    this.isVisible = true;
    this.switcherWin.show();
    this.switcherWin.focus();

    const workspaces = this.workspaceManager.getAllWorkspaces();
    this.switcherWin.webContents.send("workspace-switcher-show", {
      workspaces,
    });
  }

  hide() {
    if (this.switcherWin && !this.switcherWin.isDestroyed()) {
      this.isVisible = false;
      this.switcherWin.hide();
      this.parentWin.focus();
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
    if (this.switcherWin && !this.switcherWin.isDestroyed()) {
      this.switcherWin.destroy();
    }
    this.switcherWin = null;
  }

  emit(event, ...args) {
    if (this.listeners && this.listeners[event]) {
      this.listeners[event].forEach((fn) => fn(...args));
    }
  }

  on(event, fn) {
    if (!this.listeners) this.listeners = {};
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }
}

module.exports = WorkspaceSwitcher;
