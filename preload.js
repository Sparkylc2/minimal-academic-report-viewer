const { contextBridge, ipcRenderer } = require("electron");

const sendChannels = [
  "close-window",
  "load-new-pdf",
  "viewer-config",
  "main-window-resized",
  "main-window-moved",
];

const onChannels = [
  "viewer-config",
  "load-pdf",
  "reload-pdf",
  "load-md",
  "reload-md",
];

const invokeChannels = ["read-file"];
contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
    send: (channel, data) => {
      if (sendChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
    on: (channel, fn) => {
      if (onChannels.includes(channel)) {
        ipcRenderer.on(channel, (_event, ...args) => fn(...args));
      }
    },
    invoke: (channel, args) => {
      if (invokeChannels.includes(channel)) {
        return ipcRenderer.invoke(channel, args);
      }
    },
  },
});
