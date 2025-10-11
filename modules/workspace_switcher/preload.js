const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
    send: (channel, ...data) => {
      const validChannels = [
        "workspace-switcher-get-data",
        "workspace-switcher-switch",
        "workspace-switcher-delete",
        "workspace-switcher-rename",
        "workspace-switcher-close",
      ];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, ...data);
      }
    },
    on: (channel, fn) => {
      const validChannels = [
        "workspace-switcher-show",
        "workspace-switcher-refresh",
      ];
      if (validChannels.includes(channel)) {
        ipcRenderer.on(channel, (_event, ...args) => fn(...args));
      }
    },
  },
});
