const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
    send: (channel, ...data) => {
      const validChannels = ["tab-switch", "tab-close", "tab-new"];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, ...data);
      }
    },
    on: (channel, fn) => {
      const validChannels = ["tabs-update"];
      if (validChannels.includes(channel)) {
        ipcRenderer.on(channel, (_event, ...args) => fn(...args));
      }
    },
  },
});
