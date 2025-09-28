const PDFViewer = require("./pdf_viewer/viewer");
const WebViewer = require("./web_viewer/viewer");

class ContentManager {
  constructor(view, config) {
    this.view = view;
    this.config = config;
    this.activeModule = null;

    this.modules = {
      pdf: new PDFViewer(view, config.pdf),
      web: new WebViewer(view, config.web),
    };
  }

  async load(target) {
    if (this.activeModule) {
      this.activeModule.deactivate();
      this.activeModule = null;
    }

    if (typeof target === "string") {
      if (
        target.startsWith("/") ||
        target.startsWith("file://") ||
        /^[A-Z]:\\/.test(target)
      ) {
        for (const [name, module] of Object.entries(this.modules)) {
          if (module.canHandle(target)) {
            const success = await module.activate(target);
            if (success) {
              this.activeModule = module;
              return true;
            }
          }
        }
      } else if (
        target.startsWith("http://") ||
        target.startsWith("https://")
      ) {
        const success = await this.modules.web.activate(target);
        if (success) {
          this.activeModule = this.modules.web;
          return true;
        }
      }
    }

    console.warn("[ContentManager] Unable to handle target:", target);
    return false;
  }

  getCurrentModule() {
    return this.activeModule;
  }

  getTitle() {
    if (this.activeModule && this.activeModule.getTitle) {
      return this.activeModule.getTitle();
    }
    return "Viewer";
  }
}

module.exports = ContentManager;
