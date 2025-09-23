const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
    send: (channel, data) => {
      if (channel === "close-window" || channel === "load-new-pdf") {
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
