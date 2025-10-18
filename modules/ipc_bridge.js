const { ipcMain } = require("electron");
const { getEventBus } = require("./event_bus");

class IPCBridge {
  constructor() {
    this.bus = getEventBus();
    this.setupBridge();
  }

  setupBridge() {
    // forward bus events to renderer with ipc
    this.bus.onAny((event, data) => {
      // only fwd events meant for renderer
      if (event.startsWith("ui:") || event.startsWith("view:")) {
        const windows = require("electron").BrowserWindow.getAllWindows();
        windows.forEach((win) => {
          if (!win.isDestroyed()) {
            win.webContents.send("bus:event", event, data);
          }
        });
      }
    });

    // receive events from renderer and publish to bus
    ipcMain.on("bus:emit", (_event, eventName, data) => {
      this.bus.emit(eventName, data);
    });

    // request/response pattern
    ipcMain.handle("bus:request", async (_event, eventName, data) => {
      return await this.bus.request(eventName, data);
    });
  }
}

module.exports = IPCBridge;
