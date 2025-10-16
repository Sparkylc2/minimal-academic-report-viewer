class RendererBridge {
  constructor() {
    this.listeners = new Map();
    this.setupIPC();
  }

  setupIPC() {
    if (typeof window !== "undefined" && window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.on("bridge:receive", (data) => {
        const { channel, payload } = data;
        this.emit(channel, payload);
      });
    }
  }

  send(target, channel, payload) {
    if (typeof window !== "undefined" && window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.send("bridge:send", {
        target,
        channel,
        payload,
        sender: this.getId(),
      });
    }
  }

  async request(channel, payload) {
    if (typeof window !== "undefined" && window.electron?.ipcRenderer) {
      const result = await window.electron.ipcRenderer.invoke(
        "bridge:request",
        {
          channel,
          payload,
        },
      );

      if (result.success) {
        return result.data;
      } else {
        throw new Error(result.error);
      }
    }
    throw new Error("IPC not available");
  }

  on(channel, callback) {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, []);
    }
    this.listeners.get(channel).push(callback);
  }

  off(channel, callback) {
    if (this.listeners.has(channel)) {
      const callbacks = this.listeners.get(channel);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(channel, data) {
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

  getId() {
    if (!this._id) {
      this._id = `renderer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    return this._id;
  }

  sendToMain(channel, payload) {
    this.send("main", channel, payload);
  }

  broadcast(channel, payload) {
    this.send("all-renderers", channel, payload);
  }

  toggle(component) {
    this.sendToMain(`${component}:toggle`);
  }

  show(component) {
    this.sendToMain(`${component}:show`);
  }

  hide(component) {
    this.sendToMain(`${component}:hide`);
  }
}

const rendererBridge = new RendererBridge();

if (typeof module !== "undefined" && module.exports) {
  module.exports = rendererBridge;
}

if (typeof window !== "undefined") {
  window.rendererBridge = rendererBridge;
}
