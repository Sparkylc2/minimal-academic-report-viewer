const { default: Store } = require("electron-store");
const path = require("path");
const { debugLog } = require("./debug");

class WorkspaceManager {
  constructor() {
    this.store = new Store({
      name: "workspace-manager",
      encryptionKey: "workspace-manager-secure-key",
    });

    this.workspaces = new Map();
    this.activeWorkspaceId = null;
    this.nextId = 1;

    this._loadFromStore();
  }

  _loadFromStore() {
    try {
      const data = this.store.get("workspaces");
      if (data) {
        this.workspaces = new Map(Object.entries(data.workspaces || {}));
        this.activeWorkspaceId = data.activeWorkspaceId || null;
        this.nextId = data.nextId || 1;
        debugLog(
          "[WorkspaceManager] Loaded",
          this.workspaces.size,
          "workspaces",
        );
      }
    } catch (err) {
      console.error("[WorkspaceManager] Error loading workspaces:", err);
    }
  }

  _saveToStore() {
    try {
      const data = {
        workspaces: Object.fromEntries(this.workspaces),
        activeWorkspaceId: this.activeWorkspaceId,
        nextId: this.nextId,
      };
      this.store.set("workspaces", data);
      debugLog("[WorkspaceManager] Saved", this.workspaces.size, "workspaces");
    } catch (err) {
      console.error("[WorkspaceManager] Error saving workspaces:", err);
    }
  }

  findWorkspaceByFilePath(filePath) {
    for (const [id, workspace] of this.workspaces) {
      if (workspace.filePath === filePath) {
        return id;
      }
    }
    return null;
  }

  getWorkspace(id) {
    return this.workspaces.get(id);
  }

  getAllWorkspaces() {
    return Array.from(this.workspaces.entries()).map(([id, ws]) => ({
      id,
      filePath: ws.filePath,
      fileType: ws.fileType,
      displayName: ws.displayName || path.basename(ws.filePath),
      tabCount: ws.tabs ? ws.tabs.length : 0,
      lastAccessed: ws.lastAccessed || 0,
    }));
  }

  createWorkspace(filePath, fileType, state = null) {
    const id = String(this.nextId++);

    const workspace = {
      id,
      filePath,
      fileType,
      displayName: null,
      tabs: state?.tabs || [],
      activeTabIndex: state?.activeTabIndex || 0,
      lastAccessed: Date.now(),
    };

    this.workspaces.set(id, workspace);
    this.activeWorkspaceId = id;
    this._saveToStore();

    debugLog("[WorkspaceManager] Created workspace", id, "for", filePath);
    return id;
  }

  updateWorkspace(id, state) {
    const workspace = this.workspaces.get(id);
    if (!workspace) return;

    workspace.tabs = state.tabs || [];
    workspace.activeTabIndex = state.activeTabIndex || 0;
    workspace.lastAccessed = Date.now();

    this._saveToStore();
    debugLog("[WorkspaceManager] Updated workspace", id);
  }

  deleteWorkspace(id) {
    if (this.workspaces.size <= 1) {
      debugLog("[WorkspaceManager] Cannot delete last workspace");
      return false;
    }

    this.workspaces.delete(id);

    if (this.activeWorkspaceId === id) {
      const firstId = Array.from(this.workspaces.keys())[0];
      this.activeWorkspaceId = firstId;
    }

    this._saveToStore();
    debugLog("[WorkspaceManager] Deleted workspace", id);
    return true;
  }

  renameWorkspace(id, newName) {
    const workspace = this.workspaces.get(id);
    if (!workspace) return;

    workspace.displayName = newName;
    this._saveToStore();
    debugLog("[WorkspaceManager] Renamed workspace", id, "to", newName);
  }

  switchToWorkspace(id) {
    if (!this.workspaces.has(id)) return false;

    this.activeWorkspaceId = id;
    const workspace = this.workspaces.get(id);
    workspace.lastAccessed = Date.now();
    this._saveToStore();

    debugLog("[WorkspaceManager] Switched to workspace", id);
    return true;
  }

  getActiveWorkspace() {
    if (!this.activeWorkspaceId) return null;
    return this.workspaces.get(this.activeWorkspaceId);
  }
}

module.exports = WorkspaceManager;
