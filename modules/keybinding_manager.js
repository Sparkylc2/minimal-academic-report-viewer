/**
 * Universal Keybinding Manager
 * Works in main process, renderer process, and HTML script tags
 * Handles all the complex key parsing and normalization automatically
 */

class KeybindingManager {
  constructor(scope = "default") {
    this.scope = scope;
    this.shortcuts = new Map();
    this.isSetup = false;
    this.context = this._detectContext();
    this.globalHandler = null;
    this.debugMode = false;

    this._autoSetupPromise = null;
  }

  // ==========================================
  // CONTEXT DETECTION
  // ==========================================

  _detectContext() {
    if (
      typeof process !== "undefined" &&
      process.versions &&
      process.versions.node
    ) {
      if (process.type === "browser") {
        return "main";
      } else if (process.type === "renderer") {
        return "renderer";
      }
    }

    if (typeof window !== "undefined") {
      if (window.electron) {
        return "html-with-electron";
      } else {
        return "html";
      }
    }

    return "unknown";
  }

  // ==========================================
  // KEY PARSING & NORMALIZATION
  // ==========================================

  _normalizeKey(key) {
    const keyMappings = {
      // JavaScript input.key -> normalized
      " ": "Space",
      ",": "Comma",
      ".": "Period",
      "/": "Slash",
      ";": "Semicolon",
      "'": "Quote",
      "[": "BracketLeft",
      "]": "BracketRight",
      "\\": "Backslash",
      "`": "Backquote",
      "-": "Minus",
      "=": "Equal",
      "+": "Equal", // Plus is Shift+Equal

      // Electron accelerator -> normalized (case insensitive)
      space: "Space",
      comma: "Comma",
      period: "Period",
      slash: "Slash",
      semicolon: "Semicolon",
      quote: "Quote",
      bracketleft: "BracketLeft",
      bracketright: "BracketRight",
      backslash: "Backslash",
      backquote: "Backquote",
      minus: "Minus",
      equal: "Equal",
      plus: "Equal",

      // Arrow keys (Electron uses short names)
      up: "ArrowUp",
      down: "ArrowDown",
      left: "ArrowLeft",
      right: "ArrowRight",
      arrowup: "ArrowUp",
      arrowdown: "ArrowDown",
      arrowleft: "ArrowLeft",
      arrowright: "ArrowRight",
    };

    const lowerKey = key.toLowerCase();
    return keyMappings[lowerKey] || lowerKey;
  }

  _normalizeModifiers(modifiers) {
    return modifiers.map((mod) => {
      const lower = mod.toLowerCase();
      switch (lower) {
        case "commandorcontrol":
        case "cmdorctrl":
        case "commandorctrl":
          return "CommandOrControl";
        case "command":
        case "cmd":
          return "Command";
        case "control":
        case "ctrl":
          return "Control";
        case "alt":
        case "option":
          return "Alt";
        case "shift":
          return "Shift";
        case "meta":
          return "Meta";
        default:
          return mod;
      }
    });
  }

  _parseShortcut(shortcut) {
    if (!shortcut || typeof shortcut !== "string") {
      throw new Error(`Invalid shortcut: ${shortcut}`);
    }

    const parts = shortcut.split("+").map((p) => p.trim());
    const key = this._normalizeKey(parts.pop());
    const modifiers = this._normalizeModifiers(parts);

    return { key, modifiers, original: shortcut };
  }

  _checkModifiers(expectedModifiers, inputData) {
    const pressed = new Set();

    // Handle both main process input object and renderer/HTML event object
    const ctrlKey = inputData.ctrlKey || inputData.control;
    const metaKey = inputData.metaKey || inputData.meta;
    const altKey = inputData.altKey || inputData.alt;
    const shiftKey = inputData.shiftKey || inputData.shift;

    // Handle CommandOrControl special case
    const cmdOrCtrl = metaKey || ctrlKey;
    if (cmdOrCtrl) {
      pressed.add("CommandOrControl");
      if (metaKey) pressed.add("Command");
      if (ctrlKey) pressed.add("Control");
    }

    if (altKey) pressed.add("Alt");
    if (shiftKey) pressed.add("Shift");
    if (metaKey) pressed.add("Meta");

    // Check if all expected modifiers are pressed
    for (const expected of expectedModifiers) {
      if (!pressed.has(expected)) {
        return false;
      }
    }

    return true;
  }

  _matchesShortcut(shortcut, inputData) {
    try {
      const { key, modifiers } = this._parseShortcut(shortcut);
      const inputKey = this._normalizeKey(
        inputData.key || inputData.code || "",
      );

      return key === inputKey && this._checkModifiers(modifiers, inputData);
    } catch (error) {
      console.error(`Error matching shortcut "${shortcut}":`, error.message);
      return false;
    }
  }

  // ==========================================
  // SETUP FOR DIFFERENT CONTEXTS
  // ==========================================

  async _autoSetup() {
    if (this.isSetup || this._autoSetupPromise) {
      return this._autoSetupPromise;
    }

    this._autoSetupPromise = this._setupForContext();
    await this._autoSetupPromise;
    return this._autoSetupPromise;
  }

  async _setupForContext() {
    switch (this.context) {
      case "main":
        await this._setupMainProcess();
        break;
      case "renderer":
        await this._setupRendererProcess();
        break;
      case "html-with-electron":
        await this._setupHTMLWithElectron();
        break;
      case "html":
        await this._setupPureHTML();
        break;
      default:
        throw new Error(`Unsupported context: ${this.context}`);
    }

    this.isSetup = true;
  }

  async _setupMainProcess() {
    // In main process, we need to hook into webContents events
    // This will be handled by the component that creates webContents
    this.globalHandler = this._createKeyHandler();
  }

  async _setupRendererProcess() {
    // In renderer process, listen to the window
    this.globalHandler = this._createKeyHandler();

    // Wait for DOM to be ready
    if (typeof document !== "undefined") {
      if (document.readyState === "loading") {
        await new Promise((resolve) => {
          document.addEventListener("DOMContentLoaded", resolve, {
            once: true,
          });
        });
      }

      document.addEventListener("keydown", this.globalHandler, true);
    }
  }

  async _setupHTMLWithElectron() {
    // Same as renderer process
    await this._setupRendererProcess();
  }

  async _setupPureHTML() {
    // Pure HTML - just listen to document
    this.globalHandler = this._createKeyHandler();

    if (typeof document !== "undefined") {
      if (document.readyState === "loading") {
        await new Promise((resolve) => {
          document.addEventListener("DOMContentLoaded", resolve, {
            once: true,
          });
        });
      }

      document.addEventListener("keydown", this.globalHandler, true);
    }
  }

  _createKeyHandler() {
    if (this.context === "main") {
      // Main process: webContents 'before-input-event' passes (event, input)
      return (event, input) => {
        // console.log("Main process key event:", { event: !!event, input });

        // Don't interfere with inputs, textareas, etc.
        if (this._shouldIgnoreEvent(input)) {
          return;
        }

        // Check all registered shortcuts using input data
        for (const [shortcut, handler] of this.shortcuts) {
          if (this._matchesShortcut(shortcut, input)) {
            event.preventDefault();

            try {
              handler(input, event);
            } catch (error) {
              console.error(`Error executing shortcut "${shortcut}":`, error);
            }

            return; // Stop after first match
          }
        }
      };
    } else {
      // Renderer/HTML: document 'keydown' passes KeyboardEvent directly
      return (event) => {
        // console.log("Renderer/HTML key event:", {
        //   key: event.key,
        //   code: event.code,
        //   ctrlKey: event.ctrlKey,
        //   metaKey: event.metaKey,
        // });

        // Don't interfere with inputs, textareas, etc.
        if (this._shouldIgnoreEvent(event)) {
          return;
        }

        // Check all registered shortcuts using event data
        for (const [shortcut, handler] of this.shortcuts) {
          if (this._matchesShortcut(shortcut, event)) {
            event.preventDefault();
            event.stopPropagation();

            try {
              handler(event);
            } catch (error) {
              console.error(`Error executing shortcut "${shortcut}":`, error);
            }

            return; // Stop after first match
          }
        }
      };
    }
  }

  _shouldIgnoreEvent(inputData) {
    // For main process, we don't have target info in the input object
    if (this.context === "main") {
      // In main process, we can't easily check the target, so we'll be less restrictive
      return false;
    }

    // For renderer/HTML, we have the full event object
    if (!inputData.target) return false;

    const target = inputData.target;
    const tagName = target.tagName?.toLowerCase();

    // Ignore if typing in input fields
    if (tagName === "input" || tagName === "textarea") {
      return true;
    }

    // Ignore if element is contenteditable
    if (target.isContentEditable) {
      return true;
    }

    return false;
  }

  // ==========================================
  // PUBLIC API
  // ==========================================

  /**
   * Register a keyboard shortcut
   * @param {string} shortcut - Keyboard shortcut (e.g., "CommandOrControl+T")
   * @param {function} handler - Function to call when shortcut is pressed
   * @param {object} options - Optional settings
   */
  async register(shortcut, handler, options = {}) {
    if (!shortcut || typeof shortcut !== "string") {
      throw new Error("Shortcut must be a non-empty string");
    }

    if (typeof handler !== "function") {
      throw new Error("Handler must be a function");
    }

    // Auto-setup on first registration
    await this._autoSetup();

    // Validate shortcut format
    try {
      this._parseShortcut(shortcut);
    } catch (error) {
      throw new Error(
        `Invalid shortcut format "${shortcut}": ${error.message}`,
      );
    }

    // Store the shortcut
    this.shortcuts.set(shortcut, handler);

    if (options.debug || this.debugMode) {
      console.log(
        `[${this.scope}] Registered shortcut: ${shortcut} in ${this.context} context`,
      );
    }
  }

  /**
   * Unregister a keyboard shortcut
   * @param {string} shortcut - Shortcut to remove
   */
  unregister(shortcut) {
    return this.shortcuts.delete(shortcut);
  }

  /**
   * Clear all shortcuts
   */
  clear() {
    this.shortcuts.clear();
  }

  /**
   * Get all registered shortcuts
   */
  getShortcuts() {
    return Array.from(this.shortcuts.keys());
  }

  /**
   * Check if a shortcut is registered
   */
  has(shortcut) {
    return this.shortcuts.has(shortcut);
  }

  /**
   * Test if a shortcut string is valid
   */
  isValidShortcut(shortcut) {
    try {
      this._parseShortcut(shortcut);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Enable debug mode for troubleshooting
   */
  enableDebug() {
    this.debugMode = true;
    console.log(
      `[${this.scope}] Debug mode enabled in ${this.context} context`,
    );
  }

  /**
   * Disable debug mode
   */
  disableDebug() {
    this.debugMode = false;
  }

  /**
   * Test a key combination to see what the parser detects
   */
  testKey(inputData) {
    console.log("Testing key input:", {
      context: this.context,
      scope: this.scope,
      inputData,
      normalizedKey: this._normalizeKey(inputData.key || inputData.code || ""),
      modifiers: {
        ctrl: inputData.ctrlKey || inputData.control,
        meta: inputData.metaKey || inputData.meta,
        alt: inputData.altKey || inputData.alt,
        shift: inputData.shiftKey || inputData.shift,
      },
    });
  }

  /**
   * Get debug info about the manager
   */
  getDebugInfo() {
    return {
      scope: this.scope,
      context: this.context,
      isSetup: this.isSetup,
      debugMode: this.debugMode,
      shortcutCount: this.shortcuts.size,
      shortcuts: this.getShortcuts(),
      parsedShortcuts: Array.from(this.shortcuts.keys()).map((shortcut) => {
        try {
          return { shortcut, parsed: this._parseShortcut(shortcut) };
        } catch (error) {
          return { shortcut, error: error.message };
        }
      }),
    };
  }

  // ==========================================
  // MAIN PROCESS HELPERS
  // ==========================================

  /**
   * Attach to a webContents (main process only)
   */
  attachToWebContents(webContents) {
    if (this.context !== "main") {
      console.warn("attachToWebContents() only works in main process");
      return;
    }

    if (!this.globalHandler) {
      this.globalHandler = this._createKeyHandler();
    }

    webContents.on("before-input-event", this.globalHandler);
  }

  /**
   * Detach from a webContents (main process only)
   */
  detachFromWebContents(webContents) {
    if (this.context !== "main") {
      console.warn("detachFromWebContents() only works in main process");
      return;
    }

    if (this.globalHandler) {
      webContents.removeListener("before-input-event", this.globalHandler);
    }
  }
}

// ==========================================
// FACTORY FUNCTIONS & EXPORTS
// ==========================================

// Create scoped instances
function createKeybindingManager(scope = "default") {
  return new KeybindingManager(scope);
}

// Default instance
const defaultManager = new KeybindingManager("global");

// Convenience functions using default manager
async function register(shortcut, handler, options) {
  return defaultManager.register(shortcut, handler, options);
}

function unregister(shortcut) {
  return defaultManager.unregister(shortcut);
}

function clear() {
  return defaultManager.clear();
}

function getShortcuts() {
  return defaultManager.getShortcuts();
}

function isValidShortcut(shortcut) {
  return defaultManager.isValidShortcut(shortcut);
}

function getDebugInfo() {
  return defaultManager.getDebugInfo();
}

// ==========================================
// UNIVERSAL EXPORTS
// ==========================================

// For Node.js (main & renderer processes)
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    KeybindingManager,
    createKeybindingManager,
    register,
    unregister,
    clear,
    getShortcuts,
    isValidShortcut,
    getDebugInfo,
    default: defaultManager,
  };
}

// For browser/HTML contexts
if (typeof window !== "undefined") {
  window.KeybindingManager = KeybindingManager;
  window.keybindings = {
    create: createKeybindingManager,
    register,
    unregister,
    clear,
    getShortcuts,
    isValidShortcut,
    getDebugInfo,
    manager: defaultManager,
  };
}
