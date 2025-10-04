const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
    send: (channel, data) => {
      const channels = [
        "close-window",
        "load-new-pdf",
        "viewer-config",
        "main-window-resized",
        "main-window-moved",
      ];
      if (channels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
    on: (channel, fn) => {
      if (
        channel === "viewer-config" ||
        channel === "load-pdf" ||
        channel === "reload-pdf"
      ) {
        ipcRenderer.on(channel, (_event, ...args) => fn(...args));
      }
    },
  },
});
