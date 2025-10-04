const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
    send: (channel, ...data) => {
      const validChannels = [
        "quicklist-get-data",
        "quicklist-save",
        "quicklist-delete",
        "quicklist-rename",
        "quicklist-navigate",
        "quicklist-close",
        "quicklist-cut",
        "quicklist-paste",
        "quicklist-toggle",
        "quicklist-confirm-close-result",
      ];

      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, ...data);
      }
    },
    on: (channel, fn) => {
      const validChannels = [
        "quicklist-show",
        "quicklist-data",
        "quicklist-refresh",
        "quicklist-confirm-close",
        "main-window-resized",
        "main-window-moved",
      ];

      if (validChannels.includes(channel)) {
        ipcRenderer.on(channel, (_event, ...args) => fn(...args));
      }
    },
  },
});
