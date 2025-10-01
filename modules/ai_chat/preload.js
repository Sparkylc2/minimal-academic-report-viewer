const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
    send: (channel, data) => {
      const validChannels = [
        "chat-hide",
        "chat-send",
        "chat-config",
        "chat-get-config",
        "chat-toggle",
        "chat-pin",
        "chat-save-config",
        "chat-list-models",
      ];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
    on: (channel, fn) => {
      const validChannels = [
        "chat-reply",
        "chat-error",
        "chat-config-update",
        "chat-show",
        "chat-hide",
        "chat-toggle",
        "chat-pin-update",
        "chat-models",
        "chat-config-saved",
      ];
      if (validChannels.includes(channel)) {
        ipcRenderer.on(channel, (_event, ...args) => fn(...args));
      }
    },
    removeAllListeners: (channel) => {
      ipcRenderer.removeAllListeners(channel);
    },
  },
});
