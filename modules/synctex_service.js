const { execSync } = require("child_process");
const net = require("net");
const fs = require("fs");
const msgpack = require("msgpack-lite");
const path = require("path");
const os = require("os");
const { ipcRenderer } = require("electron");
const EventEmitter = require("events");
const { debugLog } = require("./utils");
const eventBus = new EventEmitter();

class SyncTeXService {
  constructor(mainWin) {
    this.mainWin = mainWin;
    this.nvimSocket = null;
    this.requestId = 0;
  }

  _getNeovimSocket() {
    const primarySocket = "/tmp/nvim-arview.sock";

    if (fs.existsSync(primarySocket)) {
      debugLog("[SyncTeX] Using primary socket:", primarySocket);
      return primarySocket;
    }

    debugLog("[SyncTeX] Primary socket not found, searching...");

    try {
      const cmd =
        'find /var/folders -name "nvim-arview.sock" -type s 2>/dev/null | head -1';
      const result = execSync(cmd, { encoding: "utf8", timeout: 2000 }).trim();

      if (result && fs.existsSync(result)) {
        debugLog("[SyncTeX] Found socket via search:", result);
        return result;
      }
    } catch (e) {
      console.error("[SyncTeX] Search failed:", e.message);
    }

    debugLog("[SyncTeX] No socket found, using primary path:", primarySocket);
    return primarySocket;
  }

  async connectToNeovim() {
    debugLog("[SyncTeX] Connecting to Neovim...");
    return new Promise((resolve, reject) => {
      const socketPath = this._getNeovimSocket();

      this.nvimSocket = net.connect(socketPath, () => {
        debugLog("[SyncTeX] Connected to Neovim");
        resolve();
      });

      this.nvimSocket.on("error", (err) => {
        console.error("[SyncTeX] Neovim connection error:", err);
        this.nvimSocket = null;
        reject(err);
      });
    });
  }

  pdfToSource(pdfPath, page, x, y) {
    try {
      const cmd = `synctex edit -o "${page}:${x}:${y}:${pdfPath}" -a`;
      const result = execSync(cmd, { encoding: "utf8" });

      const fileMatch = result.match(/Input:(.+)/);
      const lineMatch = result.match(/Line:(\d+)/);
      const columnMatch = result.match(/Column:(\d+)/);

      if (fileMatch && lineMatch) {
        return {
          file: fileMatch[1].trim(),
          line: parseInt(lineMatch[1]),
          column: columnMatch ? parseInt(columnMatch[1]) : 0,
        };
      }

      return null;
    } catch (err) {
      console.error("[SyncTeX] Query failed:", err.message);
      return null;
    }
  }

  sourceToPage(pdfPath, sourcePath, line, column = 0) {
    try {
      const cmd = `synctex view -i "${line}:${column}:${sourcePath}" -o "${pdfPath}"`;
      const result = execSync(cmd, { encoding: "utf8" });

      const pageMatch = result.match(/Page:(\d+)/);
      const xMatch = result.match(/x:([\d.]+)/);
      const yMatch = result.match(/y:([\d.]+)/);

      if (pageMatch && xMatch && yMatch) {
        return {
          page: parseInt(pageMatch[1]),
          x: parseFloat(xMatch[1]),
          y: parseFloat(yMatch[1]),
        };
      }

      return null;
    } catch (err) {
      console.error("[SyncTeX] Forward search failed:", err.message);
      return null;
    }
  }

  async startForwardSearchServer() {
    if (this.forwardSearchServer) {
      return;
    }

    return new Promise((resolve, reject) => {
      const net = require("net");
      const socketPath = "/tmp/nvim-arview-forward.sock";

      if (fs.existsSync(socketPath)) {
        fs.unlinkSync(socketPath);
      }

      this.forwardSearchServer = net.createServer((client) => {
        let buffer = "";
        client.on("data", (data) => {
          debugLog("[SyncTeX] Received data:", data.toString());
          buffer += data.toString();

          const lines = buffer.split("\n");

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              const message = JSON.parse(line);
              debugLog("[SyncTeX] Parsed message:", message);
              this._handleForwardSearchMessage(message);
            } catch (e) {
              console.error("[SyncTeX] Invalid forward search message:", e);
            }
          }
        });

        client.on("error", (err) => {
          console.error("[SyncTeX] Forward search client error:", err);
        });
      });

      this.forwardSearchServer.listen(socketPath, () => {
        debugLog("[SyncTeX] Forward search server listening on:", socketPath);
        resolve();
      });

      this.forwardSearchServer.on("error", (err) => {
        console.error("[SyncTeX] Forward search server error:", err);
        reject(err);
      });
    });
  }

  _handleForwardSearchMessage(message) {
    const { type, sourcePath, line } = message;

    if (type !== "forward-search") return;

    debugLog(
      `[SyncTeX] Received forward search request: ${sourcePath}:${line}`,
    );

    if (this.mainWin) {
      debugLog("[SyncTeX] Sending forward search to renderer", {
        sourcePath,
        line,
      });
      eventBus.emit("synctex-forward-search", { sourcePath, line });
    }
  }

  stopForwardSearchServer() {
    if (this.forwardSearchServer) {
      this.forwardSearchServer.close();
      this.forwardSearchServer = null;
    }

    const socketPath = "/tmp/nvim-arview-forward.sock";
    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }
  }

  async sendToNeovim(command) {
    debugLog("[SyncTeX] Sending command to Neovim:", command);
    if (!this.nvimSocket || this.nvimSocket.destroyed) {
      debugLog("[SyncTeX] Neovim socket not connected, connecting...");
      await this.connectToNeovim();
    }

    return new Promise((resolve, reject) => {
      const reqId = ++this.requestId;

      const request = msgpack.encode([0, reqId, "nvim_command", [command]]);

      let responseData = Buffer.alloc(0);

      const onData = (data) => {
        responseData = Buffer.concat([responseData, data]);

        try {
          const response = msgpack.decode(responseData);
          if (response[0] === 1 && response[1] === reqId) {
            this.nvimSocket.removeListener("data", onData);

            if (response[2]) {
              reject(new Error(response[2]));
            } else {
              resolve(response[3]);
            }
          }
        } catch (e) {}
      };

      this.nvimSocket.on("data", onData);
      this.nvimSocket.write(request);

      setTimeout(() => {
        this.nvimSocket.removeListener("data", onData);
        reject(new Error("Neovim command timeout"));
      }, 5000);
    });
  }

  async jumpToLocation(file, line, column = 0) {
    debugLog("Jumping");
    try {
      const command = `edit +${line} ${file}`;
      await this.sendToNeovim(command);

      if (column > 0) {
        await this.sendToNeovim(`normal! ${column}|`);
      }

      debugLog(`[SyncTeX] Jumped to ${file}:${line}:${column}`);
      return true;
    } catch (err) {
      console.error("[SyncTeX] Jump failed:", err);
      return false;
    }
  }

  async syncPdfToSource(pdfPath, page, x, y) {
    const location = this.pdfToSource(pdfPath, page, x, y);

    if (!location) {
      debugLog("[SyncTeX] No source location found");
      return false;
    }

    debugLog("[SyncTeX] Found location:", location);
    return await this.jumpToLocation(
      location.file,
      location.line,
      location.column,
    );
  }

  disconnect() {
    if (this.nvimSocket) {
      this.nvimSocket.destroy();
      this.nvimSocket = null;
    }
  }
}

module.exports = { SyncTeXService, eventBus };
