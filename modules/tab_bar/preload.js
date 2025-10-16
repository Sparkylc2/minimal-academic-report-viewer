const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
    send: (channel, ...data) => {
      const validChannels = [
        "tab-switch",
        "tab-close",
        "tab-new",
        "chat-toggle",
        "chat-get-config",
        "toggle-tab-bar",
      ];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, ...data);
      }
    },
    on: (channel, fn) => {
      const validChannels = [
        "tabs-update",
        "chat-config-update",
        "toggle-tab-bar",
      ];
      if (validChannels.includes(channel)) {
        ipcRenderer.on(channel, (_event, ...args) => fn(...args));
      }
    },
  },
});
