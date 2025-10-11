const { default: Store } = require("electron-store");
const path = require("path");

class SessionState {
  constructor() {
    this.store = new Store({
      name: "session-state",
      encryptionKey: "session-state-secure-key",
    });
    console.log("[SessionState] Store path:", this.store.path);
  }

  getContextKey(tabManager) {
    if (!tabManager) return "general";
    
    const pdfTab = Array.from(tabManager.tabs.values()).find(
      (tab) => tab.type === "pdf"
    );
    const markdownTab = Array.from(tabManager.tabs.values()).find(
      (tab) => tab.type === "markdown"
    );
    
    if (pdfTab) return pdfTab.target;
    if (markdownTab) return markdownTab.target;
    return "general";
  }

  async saveState(tabManager, contextKey) {
    if (!tabManager) {
      console.log("[SessionState] saveState: no tabManager");
      return;
    }
    
    const key = contextKey || this.getContextKey(tabManager);
    const storeKey = `session_${key}`;
    
    console.log("[SessionState] Saving state for context:", key);
    console.log("[SessionState] Tab count:", tabManager.tabs.size);
    
    const tabs = [];
    
    for (const tabId of tabManager.tabOrder) {
      const tab = tabManager.tabs.get(tabId);
      if (!tab) continue;
      
      console.log(`[SessionState] Processing tab ${tabId}, type: ${tab.type}`);
      
      const tabData = {
        type: tab.type,
        target: tab.target,
        title: tab.title,
      };
      
      if (tab.type === "pdf" || tab.type === "markdown") {
        const viewState = await this._getViewState(tab);
        if (viewState) {
          console.log(`[SessionState] Got view state for ${tab.type}:`, viewState);
          tabData.viewState = viewState;
        } else {
          console.log(`[SessionState] No view state for ${tab.type}`);
        }
      } else if (tab.type === "web") {
        tabData.history = tab.history || [];
        tabData.historyIndex = tab.historyIndex || 0;
      }
      
      tabs.push(tabData);
    }
    
    const activeTabIndex = tabManager.tabOrder.indexOf(tabManager.activeTab);
    
    const state = {
      tabs,
      activeTabIndex: activeTabIndex >= 0 ? activeTabIndex : 0,
      lastSaved: Date.now(),
    };
    
    console.log("[SessionState] Saving state:", JSON.stringify(state, null, 2));
    
    try {
      this.store.set(storeKey, state);
      console.log("[SessionState] State saved successfully to:", storeKey);
      
      const verified = this.store.get(storeKey);
      console.log("[SessionState] Verification - tabs count:", verified?.tabs?.length);
    } catch (err) {
      console.error("[SessionState] Error saving state:", err);
    }
  }

  loadState(contextKey) {
    const key = contextKey || "general";
    const storeKey = `session_${key}`;
    
    console.log("[SessionState] Loading state for context:", key);
    console.log("[SessionState] Store key:", storeKey);
    
    try {
      const state = this.store.get(storeKey);
      if (state) {
        console.log("[SessionState] Loaded state with", state.tabs?.length || 0, "tabs");
        console.log("[SessionState] Full state:", JSON.stringify(state, null, 2));
      } else {
        console.log("[SessionState] No saved state found");
      }
      return state || null;
    } catch (err) {
      console.error("[SessionState] Error loading state:", err);
      return null;
    }
  }

  async _getViewState(tab) {
    if (!tab || !tab.view || tab.view.webContents.isDestroyed()) {
      console.log("[SessionState] _getViewState: invalid tab or destroyed webContents");
      return null;
    }
    
    try {
      const viewState = await tab.view.webContents.executeJavaScript(
        'typeof window.getViewState === "function" ? window.getViewState() : null'
      );
      console.log("[SessionState] _getViewState result:", viewState);
      return viewState;
    } catch (err) {
      console.error("[SessionState] Error getting view state:", err);
      return null;
    }
  }
}

module.exports = SessionState;
