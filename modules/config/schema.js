// json schema for configuration validation
// ensures user config files are valid and within acceptable ranges

module.exports = {
  type: "object",
  properties: {
    version: {
      type: "string",
      pattern: "^\\d+\\.\\d+\\.\\d+$",
    },

    appearance: {
      type: "object",
      properties: {
        background: {
          type: "string",
          pattern: "^#[0-9A-Fa-f]{6}$",
          description: "Hex color code",
        },
        pageGap: {
          type: "number",
          minimum: 0,
          maximum: 100,
        },
        pageRadius: {
          type: "number",
          minimum: 0,
          maximum: 50,
        },
        margins: {
          type: "object",
          properties: {
            top: { type: "number", minimum: 0, maximum: 100 },
            right: { type: "number", minimum: 0, maximum: 100 },
            bottom: { type: "number", minimum: 0, maximum: 100 },
            left: { type: "number", minimum: 0, maximum: 100 },
          },
          required: ["top", "right", "bottom", "left"],
        },
        widthPercent: {
          type: "number",
          minimum: 0.1,
          maximum: 1.0,
        },
        overlayHeight: {
          type: "number",
          minimum: 200,
          maximum: 2000,
        },
        colors: {
          type: "object",
          properties: {
            accent: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
            muted: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
            buttonHover: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
            text: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
            mutedText: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
          },
        },
      },
    },

    pdfViewer: {
      type: "object",
      properties: {
        defaultFit: {
          type: "string",
          enum: ["width", "height", "auto"],
        },
        panSpeed: {
          type: "number",
          minimum: 0.1,
          maximum: 20,
        },
        panSpeedModifier: {
          type: "number",
          minimum: 1,
          maximum: 10,
        },
        panSmoothing: {
          type: "number",
          minimum: 0.01,
          maximum: 1,
        },
        minZoom: {
          type: "number",
          minimum: 0.01,
          maximum: 1,
        },
        maxZoom: {
          type: "number",
          minimum: 1,
          maximum: 20,
        },
        zoomIntensity: {
          type: "number",
          minimum: 0.001,
          maximum: 0.1,
        },
        maxKeyHoldTime: {
          type: "number",
          minimum: 500,
          maximum: 10000,
        },
      },
    },

    keyboard: {
      type: "object",
      properties: {
        global: {
          type: "object",
          additionalProperties: { type: "string" },
        },
        tabs: {
          type: "object",
          additionalProperties: { type: ["string", "boolean"] },
        },
        pdfNavigation: {
          type: "object",
          additionalProperties: {
            oneOf: [
              { type: "string" },
              { type: "array", items: { type: "string" } },
            ],
          },
        },
        quickList: {
          type: "object",
          additionalProperties: {
            oneOf: [
              { type: "string" },
              { type: "array", items: { type: "string" } },
            ],
          },
        },
        workspaceSwitcher: {
          type: "object",
          additionalProperties: {
            oneOf: [
              { type: "string" },
              { type: "array", items: { type: "string" } },
            ],
          },
        },
      },
    },
    tabs: {
      type: "object",
      properties: {
        height: {
          type: "number",
          minimum: 1,
          maximum: 1000,
        },
        show: {
          type: "boolean",
        },

        background: {
          type: "string",
          pattern: "^#[0-9A-Fa-f]{6}$",
          description: "Hex color code",
        },
        activeTabBackground: {
          type: "string",
          pattern: "^#[0-9A-Fa-f]{6}$",
          description: "Hex color code",
        },
        activeTabText: {
          type: "string",
          pattern: "^#[0-9A-Fa-f]{6}$",
          description: "Hex color code",
        },
        inactiveTabBackground: {
          type: "string",
          pattern: "^#[0-9A-Fa-f]{6}$",
          description: "Hex color code",
        },
        inactiveTabText: {
          type: "string",
          pattern: "^#[0-9A-Fa-f]{6}$",
          description: "Hex color code",
        },
        hoverBackground: {
          type: "string",
          pattern: "^#[0-9A-Fa-f]{6}$",
          description: "Hex color code",
        },
        hoverText: {
          type: "string",
          pattern: "^#[0-9A-Fa-f]{6}$",
          description: "Hex color code",
        },
        seperatorColor: {
          type: "string",
          pattern: "^#[0-9A-Fa-f]{6}$",
          description: "Hex color code",
        },
      },
    },

    fileWatching: {
      type: "object",
      properties: {
        stabilityThreshold: {
          type: "number",
          minimum: 100,
          maximum: 5000,
        },
        pollInterval: {
          type: "number",
          minimum: 50,
          maximum: 1000,
        },
      },
    },

    session: {
      type: "object",
      properties: {
        maxClosedTabs: {
          type: "number",
          minimum: 1,
          maximum: 100,
        },
        autoSave: {
          type: "boolean",
        },
      },
    },

    commandPalette: {
      type: "object",
      properties: {
        width: {
          type: "number",
          minimum: 200,
          maximum: 1200,
        },
        height: {
          type: "number",
          minimum: 40,
          maximum: 200,
        },
        topOffset: {
          type: "number",
          minimum: 0,
          maximum: 500,
        },
        defaultSearchEngine: {
          type: "string",
          pattern: "^https?://",
        },
        quickActions: {
          type: "object",
          additionalProperties: { type: "string", maxLength: 3 },
        },
      },
    },
  },
};
