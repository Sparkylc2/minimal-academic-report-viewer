/*
 * EventBus: coordinates and passes messages
 */
class EventBus {
  constructor(name = "default") {
    this.name = name;
    this.listeners = new Map();
    this.wildcardListeners = [];
    this.debug = false; // maybe switch this to a state call later
  }

  // subscribe to an event
  on(event, handler, options = {}) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    const wrappedHandler = {
      fn: handler,
      once: options.once || false,
      priority: options.priority || 0,
      id: options.id || `${event}_${Date.now()}_${Math.random()}`,
    };

    this.listeners.get(event).push(wrappedHandler);

    // sort by priority
    this.listeners.get(event).sort((a, b) => b.priority - a.priority);

    if (this.debug) {
      console.log(`[EventBus:${this.name}] Registered: ${event}`, options);
    }

    // return unsubscribe function
    return () => this.off(event, wrappedHandler.id);
  }

  // subscribe once
  once(event, handler, options = {}) {
    return this.on(event, handler, { ...options, once: true });
  }

  // unsubscribe
  off(event, handlerOrId) {
    if (!this.listeners.has(event)) return;

    const handlers = this.listeners.get(event);
    const index = handlers.findIndex(
      (h) => h.fn === handlerOrId || h.id === handlerOrId,
    );

    if (index !== -1) {
      handlers.splice(index, 1);
      if (this.debug) {
        console.log(`[EventBus:${this.name}] Unregistered: ${event}`);
      }
    }
  }

  // publish an event (synchronous)
  emit(event, data) {
    if (this.debug) {
      console.log(`[EventBus:${this.name}] Emit: ${event}`, data);
    }

    const handlers = this.listeners.get(event) || [];
    const toRemove = [];

    for (const handler of handlers) {
      try {
        handler.fn(data, event);
        if (handler.once) {
          toRemove.push(handler.id);
        }
      } catch (error) {
        console.error(
          `[EventBus:${this.name}] Error in handler for ${event}:`,
          error,
        );
      }
    }

    // remove once handlers
    toRemove.forEach((id) => this.off(event, id));

    // wildcard listeners
    this.wildcardListeners.forEach((handler) => {
      try {
        handler(event, data);
      } catch (error) {
        console.error(
          `[EventBus:${this.name}] Error in wildcard handler:`,
          error,
        );
      }
    });
  }

  // publish async (all handlers run, and results ar collected)
  async emitAsync(event, data) {
    if (this.debug) {
      console.log(`[EventBus:${this.name}] EmitAsync: ${event}`, data);
    }

    const handlers = this.listeners.get(event) || [];
    const toRemove = [];
    const results = [];

    for (const handler of handlers) {
      try {
        const result = await handler.fn(data, event);
        results.push(result);
        if (handler.once) {
          toRemove.push(handler.id);
        }
      } catch (error) {
        console.error(
          `[EventBus:${this.name}] Error in async handler for ${event}:`,
          error,
        );
        results.push({ error });
      }
    }

    toRemove.forEach((id) => this.off(event, id));

    return results;
  }

  // request/response pattern (first handler wins)
  async request(event, data, timeout = 5000) {
    const handlers = this.listeners.get(event) || [];

    if (handlers.length === 0) {
      throw new Error(`No handler for request: ${event}`);
    }

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Request timeout: ${event}`)), timeout);
    });

    const handlerPromise = handlers[0].fn(data, event);

    return Promise.race([handlerPromise, timeoutPromise]);
  }

  // listen to all events (for debugging)
  onAny(handler) {
    this.wildcardListeners.push(handler);
  }

  // clear all listeners
  clear() {
    this.listeners.clear();
    this.wildcardListeners = [];
  }

  // get debug info
  getStats() {
    const stats = {
      totalEvents: this.listeners.size,
      totalHandlers: 0,
      events: {},
    };

    for (const [event, handlers] of this.listeners.entries()) {
      stats.totalHandlers += handlers.length;
      stats.events[event] = handlers.length;
    }

    return stats;
  }

  enableDebug() {
    this.debug = true;
  }

  disableDebug() {
    this.debug = false;
  }
}

// singleton instance
let globalBus = null;

function getEventBus(name) {
  if (!globalBus) {
    globalBus = new EventBus("global");
  }
  return globalBus;
}

module.exports = { EventBus, getEventBus };
