const { ipcMain } = require("electron");
const eventBus = require("./event_bus");

class IPCBridge {
  constructor() {
    this.setup();
  }

  setup() {
    ipcMain.on("bridge:send", (event, data) => {
      const { target, channel, payload, sender } = data;

      if (target === "main") {
        eventBus.broadcast(channel, { payload, sender });
      } else if (target === "all-renderers") {
        this.broadcastToAllRenderers(channel, payload, event.sender);
      } else {
        this.sendToRenderer(target, channel, payload);
      }
    });

    ipcMain.handle("bridge:request", async (event, data) => {
      const { channel, payload } = data;
      try {
        const result = await eventBus.request(channel, payload);
        return { success: true, data: result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    eventBus.on("bridge:broadcast-to-renderers", (data) => {
      this.broadcastToAllRenderers(data.channel, data.payload);
    });
  }

  broadcastToAllRenderers(channel, payload, exclude = null) {
    const { webContents } = require("electron");

    webContents.getAllWebContents().forEach((contents) => {
      if (contents !== exclude && !contents.isDestroyed()) {
        try {
          contents.send("bridge:receive", { channel, payload });
        } catch (error) {}
      }
    });
  }

  sendToRenderer(target, channel, payload) {
    this.broadcastToAllRenderers(channel, payload);
  }
}

module.exports = new IPCBridge();
