const { ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const chokidar = require("chokidar");

class PDFViewer {
  constructor(view, config) {
    this.view = view;
    this.config = config || {};
    this.watcher = null;
    this.currentPath = null;
    this.isActive = false;
    this.setupIPC();
  }

  setupIPC() {
    this.reloadHandler = (_event, pdfPath) => {
      if (this.isActive && pdfPath === this.currentPath) {
        this.view.webContents.send("reload-pdf", pdfPath);
      }
    };

    this.closeHandler = () => {
      if (this.isActive) {
        this.deactivate();
      }
    };
  }

  async activate(filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
      console.warn("[PDFViewer] Invalid file path:", filePath);
      return false;
    }

    const ext = path.extname(filePath).toLowerCase();
    if (ext !== ".pdf") {
      return false;
    }

    this.isActive = true;
    this.currentPath = filePath;

    const viewerPath = path.join(__dirname, "viewer.html");
    await this.view.webContents.loadFile(viewerPath);
    this.view.webContents.send("viewer-config", this.config);

    this.view.webContents.send("load-pdf", filePath);

    this.watchFile(filePath);

    ipcMain.on("reload-pdf", this.reloadHandler);
    ipcMain.on("close-window", this.closeHandler);

    return true;
  }

  deactivate() {
    this.isActive = false;

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    ipcMain.removeListener("reload-pdf", this.reloadHandler);
    ipcMain.removeListener("close-window", this.closeHandler);

    this.currentPath = null;
  }

  watchFile(filePath) {
    if (this.watcher) {
      this.watcher.close();
    }

    this.watcher = chokidar.watch(filePath, {
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
      ignoreInitial: true,
    });

    this.watcher
      .on("add", () => this.reload())
      .on("change", () => this.reload());
  }

  reload() {
    if (
      this.isActive &&
      this.currentPath &&
      !this.view.webContents.isDestroyed()
    ) {
      this.view.webContents.send("reload-pdf", this.currentPath);
    }
  }

  canHandle(filePath) {
    if (!filePath) return false;
    const ext = path.extname(filePath).toLowerCase();
    return ext === ".pdf";
  }

  getTitle() {
    if (!this.currentPath) return "PDF Viewer";
    return path.basename(this.currentPath);
  }
}

module.exports = PDFViewer;
