const { getEventBus } = require("./event_bus");

class ChannelManager {
  constructor() {
    this.bus = getEventBus();
  }

  // send to a specific target
  send(targetId, event, data) {
    this.bus.emit(`${targetId}:${event}`, data);
  }

  // listen for events on a specific target
  on(targetId, event, handler) {
    return this.bus.on(`${targetId}:${event}`, handler);
  }

  // request/response pattern
  async request(targetId, event, data, timeout = 5000) {
    const responseEvent = `${targetId}:${event}:response`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for ${targetId}:${event}`));
      }, timeout);

      const unsub = this.bus.once(responseEvent, (response) => {
        clearTimeout(timer);
        resolve(response);
      });

      this.send(targetId, event, data);
    });
  }

  // respond to a request
  respond(targetId, event, data) {
    this.bus.emit(`${targetId}:${event}:response`, data);
  }
}

let instance = null;
function getChannels() {
  if (!instance) instance = new ChannelManager();
  return instance;
}

module.exports = { ChannelManager, getChannels };
