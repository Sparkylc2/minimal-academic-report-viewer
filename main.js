const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

let mainWindow;
let pdfPath =
  process.argv[2] || process.argv.find((arg) => arg.endsWith(".pdf"));
let watcher;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 1200,
    frame: false,
    titleBarStyle: "customButtonsOnHover", // Better for window managers
    transparent: false, // Solid background for window manager compatibility
    backgroundColor: "#ffffff",
    hasShadow: true, // Helps window managers detect the window
    vibrancy: null, // Disable vibrancy for better compatibility
    minimizable: true,
    maximizable: true,
    closable: true,
    focusable: true, // Ensure window can receive focus
    skipTaskbar: false, // Show in taskbar
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      webviewTag: true,
      webSecurity: false, // Allow CSS injection for PDF customization
    },
  });

  // Set window title for window managers
  mainWindow.setTitle("PDF Viewer");

  // Ensure window is visible to window managers
  mainWindow.setVisibleOnAllWorkspaces(false);
  mainWindow.setAlwaysOnTop(false);

  mainWindow.loadFile("index.html");

  // Send pdf path to renderer when ready
  mainWindow.webContents.on("did-finish-load", () => {
    if (pdfPath && fs.existsSync(pdfPath)) {
      mainWindow.webContents.send("load-pdf", path.resolve(pdfPath));
      watchFile(path.resolve(pdfPath));
    }
  });

  // Handle window close from keyboard shortcut
  ipcMain.on("close-window", () => {
    app.quit();
  });

  // Handle zoom controls
  ipcMain.on("zoom", (event, direction) => {
    mainWindow.webContents.send("zoom", direction);
  });
}

function watchFile(filePath) {
  if (watcher) {
    watcher.close();
  }

  let debounceTimer;
  watcher = fs.watch(filePath, (eventType) => {
    if (eventType === "change") {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        mainWindow.webContents.send("reload-pdf", filePath);
      }, 300);
    }
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (watcher) watcher.close();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle CLI arguments for live updates
ipcMain.on("load-new-pdf", (event, newPath) => {
  if (fs.existsSync(newPath)) {
    pdfPath = newPath;
    watchFile(newPath);
  }
});
