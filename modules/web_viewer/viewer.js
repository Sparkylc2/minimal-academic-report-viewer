class WebViewer {
  constructor(view, config) {
    this.view = view;
    this.config = config || {};
    this.currentUrl = null;
    this.isActive = false;
  }

  async activate(url) {
    if (!url) return false;

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }

    this.isActive = true;
    this.currentUrl = url;

    await this.view.webContents.loadURL(url);

    return true;
  }

  deactivate() {
    this.isActive = false;
    this.currentUrl = null;
  }

  canHandle(target) {
    if (target.startsWith("/") || target.startsWith("file://")) {
      return false;
    }
    return true;
  }

  getTitle() {
    if (this.view && !this.view.webContents.isDestroyed()) {
      return this.view.webContents.getTitle() || this.currentUrl || "Web";
    }
    return "Web";
  }
}

module.exports = WebViewer;
