class UniversalBridge {
  constructor() {
    this.isMain = typeof process !== "undefined" && process.type === "browser";
    this.isRenderer =
      typeof process !== "undefined" && process.type === "renderer";
    this.isWeb = typeof window !== "undefined" && !this.isRenderer;

    this.listeners = new Map();
    this.requestId = 0;
    this.pendingRequests = new Map();

    this.init();
  }

  init() {
    if (this.isMain) {
      this.initMainProcess();
    } else if (this.isRenderer) {
      this.initRendererProcess();
    } else if (this.isWeb) {
      this.initWebContext();
    }
  }

  // ===========================================
  // MAIN PROCESS SETUP
  // ===========================================
  initMainProcess() {
    const EventEmitter = require("events");
    const { ipcMain, webContents } = require("electron");

    this.eventBus = new EventEmitter();
    this.eventBus.setMaxListeners(100);

    // Handle requests from renderers
    ipcMain.handle(
      "bridge:request",
      async (event, { channel, data, requestId }) => {
        try {
          const result = await this.requestFromMain(channel, data);
          return { success: true, data: result, requestId };
        } catch (error) {
          return { success: false, error: error.message, requestId };
        }
      },
    );

    // Handle sends from renderers
    ipcMain.on("bridge:send", (event, { channel, data }) => {
      this.eventBus.emit(channel, data);
    });

    // Handle broadcasts to all renderers
    this.eventBus.on("bridge:broadcast-to-renderers", ({ channel, data }) => {
      webContents.getAllWebContents().forEach((contents) => {
        if (!contents.isDestroyed()) {
          try {
            contents.send("bridge:receive", { channel, data });
          } catch (e) {}
        }
      });
    });
  }

  // ===========================================
  // RENDERER PROCESS SETUP
  // ===========================================
  initRendererProcess() {
    const { ipcRenderer } = require("electron");

    // Listen for messages from main
    ipcRenderer.on("bridge:receive", (event, { channel, data }) => {
      this.emit(channel, data);
    });
  }

  // ===========================================
  // WEB/HTML SCRIPT SETUP
  // ===========================================
  initWebContext() {
    // For HTML script tags, we need to use the exposed API
    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.on("bridge:receive", (data) => {
        const { channel, data: payload } = data;
        this.emit(channel, payload);
      });
    }
  }

  // ===========================================
  // UNIVERSAL API - WORKS EVERYWHERE
  // ===========================================

  // Send a message (fire and forget)
  send(channel, data = null) {
    if (this.isMain) {
      this.eventBus.emit(channel, data);
    } else if (this.isRenderer) {
      const { ipcRenderer } = require("electron");
      ipcRenderer.send("bridge:send", { channel, data });
    } else if (this.isWeb && window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.send("bridge:send", { channel, data });
    }
  }

  // Request data (with response)
  async request(channel, data = null, timeout = 5000) {
    if (this.isMain) {
      return this.requestFromMain(channel, data, timeout);
    } else if (this.isRenderer) {
      const { ipcRenderer } = require("electron");
      const result = await ipcRenderer.invoke("bridge:request", {
        channel,
        data,
        requestId: ++this.requestId,
      });
      if (result.success) return result.data;
      throw new Error(result.error);
    } else if (this.isWeb && window.electron?.ipcRenderer) {
      const result = await window.electron.ipcRenderer.invoke(
        "bridge:request",
        {
          channel,
          data,
          requestId: ++this.requestId,
        },
      );
      if (result.success) return result.data;
      throw new Error(result.error);
    }
    throw new Error("Bridge not available in this context");
  }

  // Request within main process
  requestFromMain(channel, data, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const responseChannel = `${channel}:response:${Date.now()}:${Math.random()}`;

      const timer = setTimeout(() => {
        this.eventBus.removeAllListeners(responseChannel);
        reject(new Error(`Request timeout for ${channel}`));
      }, timeout);

      this.eventBus.once(responseChannel, (response) => {
        clearTimeout(timer);
        resolve(response);
      });

      this.eventBus.emit(channel, data, responseChannel);
    });
  }

  // Listen for messages
  on(channel, callback) {
    if (this.isMain) {
      this.eventBus.on(channel, callback);
    } else {
      if (!this.listeners.has(channel)) {
        this.listeners.set(channel, []);
      }
      this.listeners.get(channel).push(callback);
    }
  }

  // Remove listener
  off(channel, callback) {
    if (this.isMain) {
      this.eventBus.removeListener(channel, callback);
    } else {
      if (this.listeners.has(channel)) {
        const callbacks = this.listeners.get(channel);
        const index = callbacks.indexOf(callback);
        if (index > -1) callbacks.splice(index, 1);
      }
    }
  }

  // Respond to requests (main process only)
  respond(channel, handler) {
    if (!this.isMain) {
      console.warn("respond() only works in main process");
      return;
    }

    this.eventBus.on(channel, async (data, responseChannel) => {
      if (!responseChannel) return; // Regular send, not a request

      try {
        const result = await handler(data);
        this.eventBus.emit(responseChannel, result);
      } catch (error) {
        this.eventBus.emit(responseChannel, { error: error.message });
      }
    });
  }

  // Emit locally (for renderer processes)
  emit(channel, data) {
    if (this.isMain) {
      this.eventBus.emit(channel, data);
    } else {
      if (this.listeners.has(channel)) {
        this.listeners.get(channel).forEach((callback) => {
          try {
            callback(data);
          } catch (error) {
            console.error(`Error in bridge listener for ${channel}:`, error);
          }
        });
      }
    }
  }

  // Broadcast to all renderers (main process only)
  broadcast(channel, data) {
    if (this.isMain) {
      this.eventBus.emit("bridge:broadcast-to-renderers", { channel, data });
    } else {
      console.warn("broadcast() only works in main process");
    }
  }

  // ===========================================
  // CONVENIENCE METHODS
  // ===========================================

  // Component control shortcuts
  toggle(component) {
    this.send(`${component}:toggle`);
  }
  show(component) {
    this.send(`${component}:show`);
  }
  hide(component) {
    this.send(`${component}:hide`);
  }

  // Get current context info
  getContext() {
    return {
      isMain: this.isMain,
      isRenderer: this.isRenderer,
      isWeb: this.isWeb,
      canBroadcast: this.isMain,
      canRespond: this.isMain,
    };
  }
}

// Create singleton
const bridge = new UniversalBridge();

// Export for different contexts
if (typeof module !== "undefined" && module.exports) {
  module.exports = bridge;
} else if (typeof window !== "undefined") {
  window.bridge = bridge;
}

// Also export class for custom instances
if (typeof module !== "undefined" && module.exports) {
  module.exports.UniversalBridge = UniversalBridge;
}
