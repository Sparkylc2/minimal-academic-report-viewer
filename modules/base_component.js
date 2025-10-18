// modules/base_component.js
const { getEventBus } = require("./event_bus");
const { getRegistry } = require("./service_registry");
const { getChannels } = require("./channels");

class BaseComponent {
  constructor() {
    this.bus = getEventBus();
    this.registry = getRegistry();
    this.channels = getChannels();
    this.subscriptions = [];
  }

  // emit event to all listeners
  emit(event, data) {
    this.bus.emit(event, data);
  }

  // subscribe to broadcast events
  subscribe(event, handler, options) {
    const unsubscribe = this.bus.on(event, handler, options);
    this.subscriptions.push(unsubscribe);
    return unsubscribe;
  }

  // send to specific target
  sendTo(targetId, event, data) {
    this.channels.send(targetId, event, data);
  }

  // listen for messages to a specific target
  onTarget(targetId, event, handler) {
    const unsubscribe = this.channels.on(targetId, event, handler);
    this.subscriptions.push(unsubscribe);
    return unsubscribe;
  }

  // request/response from specific target
  async requestFrom(targetId, event, data, timeout) {
    return await this.channels.request(targetId, event, data, timeout);
  }

  // respond to a request
  respondTo(targetId, event, data) {
    this.channels.respond(targetId, event, data);
  }

  // get service from registry
  getService(name) {
    return this.registry.get(name);
  }

  // clean up all subscriptions
  destroy() {
    this.subscriptions.forEach((unsub) => unsub());
    this.subscriptions = [];
  }
}

module.exports = BaseComponent;
