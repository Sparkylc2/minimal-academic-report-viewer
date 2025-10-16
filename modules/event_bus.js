const EventEmitter = require("events");

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  request(channel, data, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const responseChannel = `${channel}:response:${Date.now()}`;

      const timeoutId = setTimeout(() => {
        this.removeAllListeners(responseChannel);
        reject(new Error(`Request timeout for ${channel}`));
      }, timeout);

      this.once(responseChannel, (response) => {
        clearTimeout(timeoutId);
        resolve(response);
      });

      this.emit(channel, data, responseChannel);
    });
  }

  respond(channel, handler) {
    this.on(channel, (data, responseChannel) => {
      const result = handler(data);
      if (result instanceof Promise) {
        result
          .then((response) => this.emit(responseChannel, response))
          .catch((error) =>
            this.emit(responseChannel, { error: error.message }),
          );
      } else {
        this.emit(responseChannel, result);
      }
    });
  }

  broadcast(channel, data) {
    this.emit(channel, data);
  }

  debug() {
    console.log("EventBus listeners:", this.eventNames());
  }
}

const eventBus = new EventBus();

module.exports = eventBus;
