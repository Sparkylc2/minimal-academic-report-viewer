const { app } = require("electron");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const EventEmitter = require("events");
const { default: Store } = require("electron-store");
const JSON5 = require("json5");
const chokidar = require("chokidar");

const Ajv = require("ajv");
const defaults = require("./defaults");
const schema = require("./schema");

class ConfigManager extends EventEmitter {
  constructor() {
    super();
    this.configDir = this._getConfigDir();
    this.configPath = path.join(this.configDir, "config.json5");

    this.store = new Store({
      name: "config",
      defaults: defaults,
    });

    const ajv = new Ajv({
      allErrors: true,
      useDefaults: false,
      strict: false,
    });
    this.validate = ajv.compile(schema);

    this.watcher = null;

    this.config = null;
    this.reset();
  }

  async init() {
    try {
      await fsp.mkdir(this.configDir, { recursive: true });

      if (!fs.existsSync(this.configPath)) {
        await this._createDefaultConfig();
      }

      await this._loadConfig();

      this._watchConfig();

      console.log("[ConfigManager] Initialized successfully");
      console.log("[ConfigManager] Config file:", this.configPath);

      return this;
    } catch (err) {
      console.error("[ConfigManager] Initialization error:", err);
      this.config = defaults;
      return this;
    }
  }

  _getConfigDir() {
    const userDataPath = app.getPath("userData");
    return userDataPath;
  }

  async _createDefaultConfig() {
    try {
      const content = this._generateCommentedConfig();

      await fsp.writeFile(this.configPath, content, "utf8");
      console.log(
        "[ConfigManager] Created default config at:",
        this.configPath,
      );
    } catch (err) {
      console.error("[ConfigManager] Error creating default config:", err);
    }
  }

  _generateCommentedConfig() {
    const d = defaults;

    return `// Academic Report Viewer Configuration
// This file uses JSON5 format - you can use comments and trailing commas!
// After editing, save the file and the app will automatically reload the config.
// 
// Config file location: ${this.configPath}

{
  version: "${d.version}",
  
  // ============================================================================
  // APPEARANCE
  // ============================================================================
  
  appearance: {
    // Main background color (hex code)
    background: "${d.appearance.background}",
    
    // Space between PDF pages (pixels)
    pageGap: ${d.appearance.pageGap},
    
    // Rounded corners for PDF pages (pixels)
    pageRadius: ${d.appearance.pageRadius},
    
    // Window margins - space reserved for UI elements (pixels)
    margins: {
      top: ${d.appearance.margins.top},
      right: ${d.appearance.margins.right},
      bottom: ${d.appearance.margins.bottom},
      left: ${d.appearance.margins.left},
    },
    
    // Width of overlay windows as percentage of main window (0.0-1.0)
    widthPercent: ${d.appearance.widthPercent},
    
    // Height of overlay windows (Quick List, Workspace Switcher) in pixels
    overlayHeight: ${d.appearance.overlayHeight},
    
    // Color scheme
    colors: {
      accent: "${d.appearance.colors.accent}",
      muted: "${d.appearance.colors.muted}",
      buttonHover: "${d.appearance.colors.buttonHover}",
      text: "${d.appearance.colors.text}",
      mutedText: "${d.appearance.colors.mutedText}",
    },
  },
  
  // ============================================================================
  // PDF VIEWER
  // ============================================================================
  
  pdfViewer: {
    // Initial zoom mode when opening PDFs: "width", "height", or "auto"
    defaultFit: "${d.pdfViewer.defaultFit}",
    
    // Base panning speed (pixels per frame)
    panSpeed: ${d.pdfViewer.panSpeed},
    
    // Speed multiplier when holding Shift while panning
    panSpeedModifier: ${d.pdfViewer.panSpeedModifier},
    
    // Smoothing factor for pan animations (0.0-1.0, lower = smoother)
    panSmoothing: ${d.pdfViewer.panSmoothing},
    
    // Minimum zoom level
    minZoom: ${d.pdfViewer.minZoom},
    
    // Maximum zoom level
    maxZoom: ${d.pdfViewer.maxZoom},
    
    // Mouse wheel zoom sensitivity
    zoomIntensity: ${d.pdfViewer.zoomIntensity},
    
    // Maximum time a key can be held before being considered stuck (milliseconds)
    maxKeyHoldTime: ${d.pdfViewer.maxKeyHoldTime},
  },
  
  // ============================================================================
  // KEYBOARD SHORTCUTS
  // ============================================================================
  // Format: Use Electron accelerator syntax
  // - CommandOrControl maps to Cmd on Mac, Ctrl on Windows/Linux
  // - Shift, Alt, etc. are modifiers
  // - For multiple key bindings, use arrays like: ["h", "ArrowLeft"]
  
  keyboard: {
    // Global shortcuts (work anywhere in the app)
    global: {
      commandPalette: "${d.keyboard.global.commandPalette}",
      quickList: "${d.keyboard.global.quickList}",
      workspaceSwitcher: "${d.keyboard.global.workspaceSwitcher}",
      addToQuickList: "${d.keyboard.global.addToQuickList}",
      reload: "${d.keyboard.global.reload}",
    },
    
    // Tab management shortcuts
    tabs: {
      newTab: "${d.keyboard.tabs.newTab}",
      closeTab: "${d.keyboard.tabs.closeTab}",
      reopenTab: "${d.keyboard.tabs.reopenTab}",
      reloadTab: "${d.keyboard.tabs.reloadTab}",
      navigateBack: "${d.keyboard.tabs.navigateBack}",
      navigateForward: "${d.keyboard.tabs.navigateForward}",
      toggleTabBar: "${d.keyboard.tabs.toggleTabBar}",
      // Cmd+1-9 automatically switches to that tab number
      switchToTab: ${d.keyboard.tabs.switchToTab},
    },
    
    // PDF navigation (keys without modifiers unless specified)
    pdfNavigation: {
      panLeft: ${JSON.stringify(d.keyboard.pdfNavigation.panLeft)},
      panRight: ${JSON.stringify(d.keyboard.pdfNavigation.panRight)},
      panUp: ${JSON.stringify(d.keyboard.pdfNavigation.panUp)},
      panDown: ${JSON.stringify(d.keyboard.pdfNavigation.panDown)},
      panFastModifier: "${d.keyboard.pdfNavigation.panFastModifier}",
      jumpTop: "${d.keyboard.pdfNavigation.jumpTop}",
      jumpBottom: "${d.keyboard.pdfNavigation.jumpBottom}",
      pageForward: "${d.keyboard.pdfNavigation.pageForward}",
      pageBack: "${d.keyboard.pdfNavigation.pageBack}",
      zoomIn: "${d.keyboard.pdfNavigation.zoomIn}",
      zoomOut: "${d.keyboard.pdfNavigation.zoomOut}",
      zoomReset: "${d.keyboard.pdfNavigation.zoomReset}",
    },
    
    // Quick List shortcuts
    quickList: {
      delete: "${d.keyboard.quickList.delete}",
      rename: "${d.keyboard.quickList.rename}",
      navigateDown: ${JSON.stringify(d.keyboard.quickList.navigateDown)},
      navigateUp: ${JSON.stringify(d.keyboard.quickList.navigateUp)},
      close: "${d.keyboard.quickList.close}",
    },
    
    // Workspace Switcher shortcuts
    workspaceSwitcher: {
      delete: "${d.keyboard.workspaceSwitcher.delete}",
      rename: "${d.keyboard.workspaceSwitcher.rename}",
      navigateDown: ${JSON.stringify(d.keyboard.workspaceSwitcher.navigateDown)},
      navigateUp: ${JSON.stringify(d.keyboard.workspaceSwitcher.navigateUp)},
      close: "${d.keyboard.workspaceSwitcher.close}",
    },
  },
  
  // ============================================================================
  // TAB BAR APPEARANCE
  // ============================================================================
  
  tabs: {
    // Height of the tab bar in pixels
    height: ${d.tabs.height},
    
    // Whether to show the tab bar
    show: ${d.tabs.show},
    
    // Tab bar colors
    background: "${d.tabs.background}",
    activeTabBackground: "${d.tabs.activeTabBackground}",
    activeTabText: "${d.tabs.activeTabText}",
    inactiveTabBackground: "${d.tabs.inactiveTabBackground}",
    inactiveTabText: "${d.tabs.inactiveTabText}",
    hoverBackground: "${d.tabs.hoverBackground}",
    hoverText: "${d.tabs.hoverText}",
    separatorColor: "${d.tabs.separatorColor}",
  },
  
  // ============================================================================
  // FILE WATCHING
  // ============================================================================
  
  fileWatching: {
    // Time to wait for file to stabilize before reloading (milliseconds)
    stabilityThreshold: ${d.fileWatching.stabilityThreshold},
    
    // How often to poll for file changes (milliseconds)
    pollInterval: ${d.fileWatching.pollInterval},
  },
  
  // ============================================================================
  // SESSION & STATE
  // ============================================================================
  
  session: {
    // Maximum number of closed tabs to remember for "reopen tab"
    maxClosedTabs: ${d.session.maxClosedTabs},
    
    // Whether to automatically save session state
    autoSave: ${d.session.autoSave},
  },
  
  // ============================================================================
  // COMMAND PALETTE
  // ============================================================================
  
  commandPalette: {
    width: ${d.commandPalette.width},
    height: ${d.commandPalette.height},
    topOffset: ${d.commandPalette.topOffset},
    
    // Default search engine (use %s for query placeholder)
    defaultSearchEngine: "${d.commandPalette.defaultSearchEngine}",
    
    // Quick action triggers (type these + Tab for actions)
    quickActions: {
      switchToWeb: "${d.commandPalette.quickActions.switchToWeb}",
      switchToPdf: "${d.commandPalette.quickActions.switchToPdf}",
      goBack: "${d.commandPalette.quickActions.goBack}",
      goForward: "${d.commandPalette.quickActions.goForward}",
    },
  },
}
`;
  }

  async _loadConfig() {
    try {
      const content = await fsp.readFile(this.configPath, "utf8");
      const parsed = JSON5.parse(content);

      this._validateConfig(parsed);

      this.config = this._deepMerge(defaults, parsed);

      this.store.set(this.config);

      console.log("[ConfigManager] Config loaded and validated");

      this.emit("loaded", this.config);
    } catch (err) {
      console.error("[ConfigManager] Error loading config:", err);

      const storeConfig = this.store.store;
      if (storeConfig && Object.keys(storeConfig).length > 0) {
        console.log("[ConfigManager] Using config from electron-store");
        this.config = storeConfig;
      } else {
        console.log("[ConfigManager] Falling back to defaults");
        this.config = defaults;
      }
    }
  }

  _validateConfig(config) {
    console.log(config);
    const valid = this.validate(config);

    if (!valid) {
      const errors = this.validate.errors
        .map((err) => {
          const path = err.instancePath || "root";
          const message = err.message;
          const params = JSON.stringify(err.params);
          return `  • ${path}: ${message} ${params}`;
        })
        .join("\n");

      throw new Error(`Configuration validation failed:\n${errors}`);
    }
  }

  _watchConfig() {
    if (this.watcher) {
      this.watcher.close();
    }

    this.watcher = chokidar.watch(this.configPath, {
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
      ignoreInitial: true,
    });

    this.watcher.on("change", async () => {
      console.log("[ConfigManager] Config file changed, reloading...");

      try {
        await this._loadConfig();
        this.emit("changed", this.config);
        console.log("[ConfigManager] Config reloaded successfully");
      } catch (err) {
        console.error("[ConfigManager] Error reloading config:", err);
        this.emit("error", err);
      }
    });
  }

  _deepMerge(target, source) {
    const output = Object.assign({}, target);

    if (this._isObject(target) && this._isObject(source)) {
      Object.keys(source).forEach((key) => {
        if (this._isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this._deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }

    return output;
  }

  _isObject(item) {
    return item && typeof item === "object" && !Array.isArray(item);
  }

  get(path) {
    if (!path) return this.config;

    const keys = path.split(".");
    let value = this.config;

    for (const key of keys) {
      if (value && typeof value === "object" && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }

    return value;
  }

  async openConfigFile() {
    const { shell } = require("electron");
    await shell.openPath(this.configPath);
  }

  async openConfigDirectory() {
    const { shell } = require("electron");
    await shell.openPath(this.configDir);
  }

  async reset() {
    await this._createDefaultConfig();
  }

  destroy() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}

module.exports = ConfigManager;
