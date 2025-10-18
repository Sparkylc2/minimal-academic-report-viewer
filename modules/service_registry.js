class ServiceRegistry {
  constructor() {
    this.services = new Map();
    this.factories = new Map();
    this.singletons = new Set();
    this.initializing = new Set();

    this.debug = false;
  }

  // register a service instance
  register(name, instance, options = {}) {
    if (this.services.has(name) && !options.replace) {
      throw new Error(`Service "${name}" already registered`);
    }

    this.services.set(name, instance);

    if (options.singleton !== false) {
      this.singletons.add(name);
    }

    if (this.debug) {
      console.log(`[Registry] Registered: ${name}`);
    }
    return this;
  }

  // register a factory function (lazy init)
  registerFactory(name, factory, options = {}) {
    if (this.factories.has(name) && !options.replace) {
      throw new Error(`Factory "${name}" already registered`);
    }

    this.factories.set(name, {
      fn: factory,
      singleton: options.singleton !== false,
    });

    if (this.debug) {
      console.log(`[Registry] Factory registered: ${name}`);
    }

    return this;
  }

  // get a service (creates if factory exists)
  get(name) {
    // return existing instance
    if (this.services.has(name)) {
      return this.services.get(name);
    }

    // create from factory
    if (this.factories.has(name)) {
      // prevent circular dependencies
      if (this.initializing.has(name)) {
        throw new Error(`Circular dependency detected: ${name}`);
      }

      this.initializing.add(name);

      try {
        const { fn, singleton } = this.factories.get(name);
        const instance = fn(this);

        if (singleton) {
          this.services.set(name, instance);
          this.singletons.add(name);
          this.factories.delete(name);
        }

        this.initializing.delete(name);
        return instance;
      } catch (error) {
        this.initializing.delete(name);
        throw new Error(`Failed to create service "${name}": ${error.message}`);
      }
    }

    throw new Error(`Service "${name}" not found`);
  }

  // check if service exists (without creating it)
  has(name) {
    return this.services.has(name) || this.factories.has(name);
  }

  // get multiple services at once
  getAll(...names) {
    return names.map((name) => this.get(name));
  }

  // remove a service
  unregister(name) {
    this.services.delete(name);
    this.factories.delete(name);
    this.singletons.delete(name);
    console.log(`[Registry] Unregistered: ${name}`);
  }

  // clear all services
  clear() {
    this.services.clear();
    this.factories.clear();
    this.singletons.clear();
    this.initializing.clear();
  }

  // get all registered service names
  listServices() {
    return {
      instances: Array.from(this.services.keys()),
      factories: Array.from(this.factories.keys()),
    };
  }

  // debug info
  getStats() {
    return {
      instances: this.services.size,
      factories: this.factories.size,
      singletons: this.singletons.size,
    };
  }
}

// singleton instance
let globalRegistry = null;

function getRegistry() {
  if (!globalRegistry) {
    globalRegistry = new ServiceRegistry();
  }
  return globalRegistry;
}

module.exports = { ServiceRegistry, getRegistry };
