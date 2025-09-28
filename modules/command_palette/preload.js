const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
    send: (channel, ...data) => {
      const validChannels = [
        "palette-execute",
        "palette-cancel",
        "palette-input-changed",
        "palette-tab-command",
      ];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, ...data);
      }
    },
    on: (channel, fn) => {
      const validChannels = ["palette-show", "palette-hide", "show-pdf-list"];
      if (validChannels.includes(channel)) {
        ipcRenderer.on(channel, (_event, ...args) => fn(...args));
      }
    },
  },
});
