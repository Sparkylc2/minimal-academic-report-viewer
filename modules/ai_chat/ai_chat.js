// ai_chat.js
const { app, BrowserWindow, ipcMain, safeStorage } = require("electron");
const path = require("path");
const fs = require("fs");
const https = require("https");
const { URL } = require("url");

class AIChat {
  constructor(
    parentWindow,
    viewerConfig = { margins: { top: 0, right: 0, bottom: 0, left: 0 } },
  ) {
    this.parentWin = parentWindow;
    this.margins = viewerConfig.margins;
    this.chatWin = null;
    this.isVisible = true;
    this.pinMode = "none";
    this.history = [];

    this.configPath = path.join(app.getPath("userData"), "ai_chat_config.json");

    this.config = {
      provider: "openai",
      model: "gpt-4o-mini",
      apiKey: null,
      theme: "dark",
    };

    this._loadConfigFromDisk();
    this.setupIPC();
  }

  // ---------- window lifecycle ----------
  create() {
    console.log("AIChat create window");
    if (this.chatWin && !this.chatWin.isDestroyed()) return;
    console.log(this.margins);
    const p = this.parentWin.getBounds();
    const inner = this._innerRect(p);

    const width = Math.min(480, Math.max(380, Math.round(inner.width * 0.35)));
    const height = Math.max(420, Math.min(720, inner.height - 80));

    this.chatWin = new BrowserWindow({
      parent: this.parentWin,
      width,
      height,
      x: Math.round(inner.x + inner.width - width - 16),
      y: Math.round(inner.y + 16),
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      hasShadow: false,
      roundedCorners: false,
      resizable: true,
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, "preload.js"),
      },
    });

    this.chatWin.loadFile(path.join(__dirname, "ai_chat.html"));

    this.chatWin.once("ready-to-show", () => {
      if (!this.chatWin || this.chatWin.isDestroyed()) return;
      this.chatWin.show();
      this.isVisible = true;
      this._syncPinUI();
      try {
        this.chatWin.webContents.send("chat-show");
      } catch {}
    });

    this.chatWin.on("closed", () => {
      this.chatWin = null;
      this.isVisible = false;
    });
  }

  show() {
    this.create();
    if (!this.chatWin || this.chatWin.isDestroyed()) return;
    if (!this.chatWin.isVisible()) {
      this.chatWin.show();
      this.isVisible = true;
      this._syncPinUI();
      try {
        this.chatWin.webContents.send("chat-show");
      } catch {}
    }
  }

  hide() {
    if (!this.chatWin || this.chatWin.isDestroyed()) return;
    this.chatWin.hide();
    this.isVisible = false;
    try {
      this.chatWin.webContents.send("chat-hide");
    } catch {}
  }

  toggle() {
    if (this.isVisible && this.chatWin && this.chatWin.isVisible()) this.hide();
    else this.show();
  }

  destroy() {
    if (this.chatWin && !this.chatWin.isDestroyed()) this.chatWin.destroy();
    this.chatWin = null;
    this.isVisible = false;
  }

  // ---------- IPC ----------
  setupIPC() {
    ipcMain.on("chat-toggle", () => this.toggle());
    ipcMain.on("chat-hide", () => this.hide());

    ipcMain.on("chat-send", async (_event, payload) => {
      const text = (payload && payload.text) || "";
      if (!text) return;

      this.history.push({ role: "user", content: text });
      this.history = this.history.slice(-20);

      try {
        const reply = await this._callProvider(text);
        const content = reply || "(no content)";
        this.history.push({ role: "assistant", content });
        if (this.chatWin && !this.chatWin.isDestroyed()) {
          this.chatWin.webContents.send("chat-reply", {
            role: "assistant",
            text: content,
          });
        }
      } catch (err) {
        const msg = err?.message || String(err);
        if (this.chatWin && !this.chatWin.isDestroyed()) {
          this.chatWin.webContents.send("chat-error", msg);
        }
      }
    });

    ipcMain.on("chat-config", (_event, updates) => {
      this.config = { ...this.config, ...(updates || {}) };
      this._broadcastConfig();
    });

    ipcMain.on("chat-save-config", (_event, updates) => {
      this.config = { ...this.config, ...(updates || {}) };
      this._saveConfigToDisk();
      this._broadcastConfig();
      if (this.chatWin && !this.chatWin.isDestroyed()) {
        this.chatWin.webContents.send("chat-config-saved", { ok: true });
      }
    });

    ipcMain.on("chat-get-config", (event) => {
      event.reply("chat-config-update", this._publicConfig());
    });

    ipcMain.on("chat-pin", (_event, payload) => {
      const mode = payload?.mode || "none";
      this.applyPinMode(mode);
      this._syncPinUI();
    });

    ipcMain.on("chat-list-models", async (_event, payload) => {
      try {
        const provider = String(
          payload?.provider || this.config.provider || "openai",
        ).toLowerCase();
        const key = String(payload?.apiKey || this.config.apiKey || "");
        if (!key) throw new Error("No API key set. Enter your key first.");

        let models = [];
        if (provider === "openai") {
          models = await this._listOpenAIModels(key);
        } else if (provider === "anthropic") {
          models = await this._listAnthropicModels(key);
        }

        if (this.chatWin && !this.chatWin.isDestroyed()) {
          this.chatWin.webContents.send("chat-models", { provider, models });
        }
      } catch (err) {
        if (this.chatWin && !this.chatWin.isDestroyed()) {
          this.chatWin.webContents.send("chat-models", {
            error: err?.message || String(err),
            provider: payload?.provider,
          });
        }
      }
    });
  }

  _broadcastConfig() {
    if (this.chatWin && !this.chatWin.isDestroyed()) {
      this.chatWin.webContents.send("chat-config-update", this._publicConfig());
    }
  }

  _publicConfig() {
    const { apiKey, ...rest } = this.config;
    return { ...rest, hasKey: !!apiKey };
  }

  // ---------- margins helpers ----------
  _innerRect(parentBounds) {
    const { x, y, width, height } = parentBounds;
    const m = this.margins || { top: 0, right: 0, bottom: 0, left: 0 };
    return {
      x: x + m.left,
      y: y + m.top,
      width: Math.max(0, width - m.left - m.right),
      height: Math.max(0, height - m.top - m.bottom),
    };
  }

  // ---------- pin modes ----------
  _syncPinUI() {
    if (!this.chatWin || this.chatWin.isDestroyed()) return;
    const isFree = this.pinMode === "none";
    this.chatWin.setResizable(isFree);
    try {
      this.chatWin.setMovable(isFree);
    } catch {}
    this.chatWin.webContents.send("chat-pin-update", {
      mode: this.pinMode,
      draggable: isFree,
    });
  }

  applyPinMode(mode) {
    this.pinMode = mode;
    if (!this.chatWin || this.chatWin.isDestroyed()) return;

    if (mode === "fixed") {
      this.chatWin.setBounds(this.chatWin.getBounds());
      return;
    }

    if (mode === "smart") {
      const inner = this._innerRect(this.parentWin.getBounds());
      const current = this.chatWin.getBounds();

      const candidates = [];

      // FULL
      candidates.push({
        x: inner.x,
        y: inner.y,
        width: inner.width,
        height: inner.height,
      });

      // HALVES
      const halfW = Math.round(inner.width / 2);
      const halfH = Math.round(inner.height / 2);
      candidates.push(
        { x: inner.x, y: inner.y, width: halfW, height: inner.height }, // left half
        { x: inner.x + halfW, y: inner.y, width: halfW, height: inner.height }, // right half
        { x: inner.x, y: inner.y, width: inner.width, height: halfH }, // top half
        { x: inner.x, y: inner.y + halfH, width: inner.width, height: halfH }, // bottom half
      );

      // QUADRANTS
      candidates.push(
        { x: inner.x, y: inner.y, width: halfW, height: halfH }, // TL
        { x: inner.x + halfW, y: inner.y, width: halfW, height: halfH }, // TR
        { x: inner.x, y: inner.y + halfH, width: halfW, height: halfH }, // BL
        { x: inner.x + halfW, y: inner.y + halfH, width: halfW, height: halfH }, // BR
      );

      // 1/4 x 1/2 side strips
      const qW = Math.round(inner.width / 4);
      candidates.push(
        { x: inner.x, y: inner.y, width: qW, height: halfH }, // L top
        { x: inner.x, y: inner.y + halfH, width: qW, height: halfH }, // L bottom
        { x: inner.x + inner.width - qW, y: inner.y, width: qW, height: halfH }, // R top
        {
          x: inner.x + inner.width - qW,
          y: inner.y + halfH,
          width: qW,
          height: halfH,
        }, // R bottom
      );

      const cx = current.x + current.width / 2;
      const cy = current.y + current.height / 2;
      let best = candidates[0];
      let bestDist = Infinity;

      for (const c of candidates) {
        const cCx = c.x + c.width / 2;
        const cCy = c.y + c.height / 2;
        const d = (cCx - cx) * (cCx - cx) + (cCy - cy) * (cCy - cy);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }

      this.chatWin.setBounds(best);
      return;
    }
  }

  // ---------- persistence ----------
  _loadConfigFromDisk() {
    try {
      if (!fs.existsSync(this.configPath)) return;
      const raw = fs.readFileSync(this.configPath);
      const json = JSON.parse(String(raw) || "{}");
      const cfg = { ...json };

      if (cfg._keyEnc && safeStorage?.isEncryptionAvailable?.()) {
        try {
          const buf = Buffer.from(cfg._keyEnc, "base64");
          cfg.apiKey = safeStorage.decryptString(buf);
        } catch {
          cfg.apiKey = null;
        }
      } else if (typeof cfg.apiKey === "string") {
      }

      delete cfg._keyEnc;
      this.config = { ...this.config, ...cfg };
    } catch {}
  }

  _saveConfigToDisk() {
    const out = { ...this.config };
    if (out.apiKey && safeStorage?.isEncryptionAvailable?.()) {
      try {
        const enc = safeStorage.encryptString(out.apiKey);
        out._keyEnc = Buffer.from(enc).toString("base64");
        delete out.apiKey;
      } catch {}
    }
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(out, null, 2));
    } catch {}
  }

  // ---------- provider calls ----------
  async _callProvider(userText) {
    const provider = (this.config.provider || "openai").toLowerCase();
    const apiKey = this.config.apiKey;

    if (!apiKey) {
      throw new Error(
        `No API key set for ${provider}. Open Settings and add one.`,
      );
    }

    if (provider === "openai") {
      return await this._openaiChat(
        apiKey,
        this.config.model || "gpt-4o-mini",
        this.history,
      );
    } else if (provider === "anthropic") {
      return await this._anthropicChat(
        apiKey,
        this.config.model || "claude-3-5-sonnet-latest",
        this.history,
      );
    } else {
      return `You said: ${userText}`;
    }
  }

  async _openaiChat(key, model, history) {
    const url = "https://api.openai.com/v1/chat/completions";
    const messages = normalizeToOpenAIMessages(history);
    const data = await this._postJSON(
      url,
      {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      { model, messages, temperature: 0.7 },
    );
    const out = data?.choices?.[0]?.message?.content;
    if (!out) throw new Error("OpenAI returned no choices.");
    return out;
  }

  async _anthropicChat(key, model, history) {
    const url = "https://api.anthropic.com/v1/messages";
    const messages = normalizeToAnthropicMessages(history);
    const data = await this._postJSON(
      url,
      {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      { model, max_tokens: 1024, messages },
    );
    const parts = data?.content || [];
    const out = parts
      .map((p) => p?.text || "")
      .join("")
      .trim();
    if (!out) throw new Error("Anthropic returned no content.");
    return out;
  }

  async _listOpenAIModels(key) {
    const urlStr = "https://api.openai.com/v1/models";
    const json = await this._getJSON(urlStr, {
      Authorization: `Bearer ${key}`,
    });
    const ids = (json?.data || []).map((m) => m?.id).filter(Boolean);

    return ids
      .filter((id) => /^gpt-|^o1|^o3/i.test(id))
      .filter((id) => !/embedding|whisper|tts|audio|vision/i.test(id))
      .sort();
  }
  async _listAnthropicModels(key) {
    const urlStr = "https://api.anthropic.com/v1/models";
    const json = await this._getJSON(urlStr, {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    });
    const ids = (json?.data || []).map((m) => m?.id).filter(Boolean);
    return ids.filter((id) => /claude/i.test(id)).sort();
  }

  _postJSON(urlStr, headers, bodyObj) {
    const body = JSON.stringify(bodyObj);
    return new Promise((resolve, reject) => {
      const u = new URL(urlStr);
      const req = https.request(
        {
          method: "POST",
          hostname: u.hostname,
          path: u.pathname + (u.search || ""),
          port: u.port || 443,
          headers: {
            ...headers,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (res) => this._collectJSON(res, resolve, reject),
      );
      req.on("error", reject);
      req.write(body);
      req.end();
    });
  }
  _getJSON(urlStr, headers) {
    return new Promise((resolve, reject) => {
      const u = new URL(urlStr);
      const req = https.request(
        {
          method: "GET",
          hostname: u.hostname,
          path: u.pathname + (u.search || ""),
          port: u.port || 443,
          headers: { ...headers },
        },
        (res) => this._collectJSON(res, resolve, reject),
      );
      req.on("error", reject);
      req.end();
    });
  }
  _collectJSON(res, resolve, reject) {
    let buf = "";
    res.setEncoding("utf8");
    res.on("data", (chunk) => (buf += chunk));
    res.on("end", () => {
      try {
        const json = buf ? JSON.parse(buf) : {};
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(json);
        else {
          const msg =
            json?.error?.message ||
            json?.error ||
            buf ||
            `HTTP ${res.statusCode}`;
          reject(new Error(msg));
        }
      } catch (e) {
        reject(e);
      }
    });
  }
}

function normalizeToOpenAIMessages(history) {
  const msgs = [{ role: "system", content: "You are a helpful AI assistant." }];
  for (const m of history) {
    if (m.role === "user" || m.role === "assistant" || m.role === "system") {
      msgs.push({ role: m.role, content: m.content });
    }
  }
  return msgs;
}
function normalizeToAnthropicMessages(history) {
  const out = [];
  for (const m of history) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const last = out[out.length - 1];
    const part = { type: "text", text: m.content };
    if (last && last.role === m.role) last.content.push(part);
    else out.push({ role: m.role, content: [part] });
  }
  if (!out.length)
    out.push({ role: "user", content: [{ type: "text", text: "Hello" }] });
  return out;
}

module.exports = AIChat;
