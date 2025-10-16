// default configuration values
// source of truth for all configurable options

module.exports = {
  version: "1.0.0",

  appearance: {
    // background color for the entire application
    background: "#181616",

    // space between PDF pages in pixels
    pageGap: 16,

    // corner radius for PDF pages in pixels
    pageRadius: 8,

    // window margins (space reserved for UI elements)
    margins: {
      top: 16,
      right: 0,
      bottom: 8,
      left: 0,
    },

    // width percentage for overlay windows (Quick List, Workspace Switcher)
    widthPercent: 0.95,

    // height of overlay windows in pixels
    overlayHeight: 500,

    // application color scheme
    colors: {
      accent: "#8ab4ff",
      muted: "#3a3939",
      buttonHover: "#98bb6c",
      text: "#e6e1dc",
      mutedText: "#9e9a96",
    },
  },

  pdfViewer: {
    // initial zoom mode: "width", "height", or "auto"
    defaultFit: "auto",

    // base panning speed (pixels per frame)
    panSpeed: 3.5,

    // speed multiplier when holding Shift while panning
    panSpeedModifier: 2.5,

    // smoothing factor for pan animations (0-1, lower = smoother)
    panSmoothing: 0.15,

    // minimum zoom level
    minZoom: 0.1,

    // maximum zoom level
    maxZoom: 6.0,

    // mouse wheel zoom sensitivity
    zoomIntensity: 0.018,

    // maximum time a key can be held before being considered stuck (ms)
    maxKeyHoldTime: 3000,
  },

  keyboard: {
    // global shortcuts (work anywhere in the app)
    global: {
      commandPalette: "CommandOrControl+P",
      quickList: "CommandOrControl+/",
      workspaceSwitcher: "CommandOrControl+Shift+/",
      addToQuickList: "CommandOrControl+U",
      reload: "CommandOrControl+R",
    },

    // tab management shortcuts
    tabs: {
      newTab: "CommandOrControl+T",
      closeTab: "CommandOrControl+W",
      reopenTab: "CommandOrControl+Shift+T",
      navigateBack: "CommandOrControl+Left",
      navigateForward: "CommandOrControl+Right",
      toggleTabBar: "CommandOrControl+Comma",
      // tab numbers 1-9 are automatically mapped to CommandOrControl+1-9
      switchToTab: true,
    },

    // pdf navigation (keys without modifiers)
    pdfNavigation: {
      // panning keys (can be arrays for multiple bindings)
      panLeft: ["h", "ArrowLeft"],
      panRight: ["l", "ArrowRight"],
      panUp: ["k", "ArrowUp"],
      panDown: ["j", "ArrowDown"],

      // modifier key for faster panning
      panFastModifier: "Shift",

      // jump to top/bottom
      jumpTop: "g",
      jumpBottom: "G",

      // page navigation
      pageForward: "Enter",
      pageBack: "Shift+Enter",

      // zoom shortcuts
      zoomIn: "CommandOrControl+=",
      zoomOut: "CommandOrControl+-",
      zoomReset: "CommandOrControl+0",
    },

    // quick list shortcuts
    quickList: {
      delete: "d",
      rename: "r",
      navigateDown: ["ArrowDown", "Alt+J"],
      navigateUp: ["ArrowUp", "Alt+K"],
      close: "Escape",
    },

    // workspace Switcher shortcuts
    workspaceSwitcher: {
      delete: "d",
      rename: "r",
      navigateDown: ["ArrowDown", "Alt+J"],
      navigateUp: ["ArrowUp", "Alt+K"],
      close: "Escape",
    },
  },

  // tab bar appearance and behavior
  tabs: {
    // height of the tab bar in pixels
    height: 32,

    // whether to show the tab bar
    show: false,

    // background color of the tab bar
    background: "#181616",

    // color of the active tab
    activeTabBackground: "#181616",

    // text color of the active tab
    activeTabText: "#ffffff",

    // color of inactive tabs
    inactiveTabBackground: "#181616",

    // text color of inactive tabs
    inactiveTabText: "#9e9a96",

    // hover color for tabs
    hoverBackground: "#181616",

    // hover text color for tabs
    hoverText: "#ffffff",

    // color of the tab bar separator line
    separatorColor: "#8d9a7e",
  },

  fileWatching: {
    // time to wait for file to stabilize before reloading (ms)
    stabilityThreshold: 300,

    // how often to poll for file changes (ms)
    pollInterval: 100,
  },

  session: {
    // maximum number of closed tabs to remember for "reopen tab"
    maxClosedTabs: 30,

    // whether to automatically save session state
    autoSave: true,
  },

  commandPalette: {
    // dimensions
    width: 600,
    height: 60,

    // distance from top of window (pixels)
    topOffset: 120,

    // default search engine URL (use %s for query placeholder)
    defaultSearchEngine: "https://www.google.com/search?q=%s",

    // quick action triggers (type these + Tab for actions)
    quickActions: {
      switchToWeb: "s",
      switchToPdf: "p",
      goBack: "b",
      goForward: "f",
    },
  },
};
