import * as BetterQueue from '../../lib/better-queue/queue';
import {EventTypes} from '../models/event-types';
import {toMixin} from '../../lib/foibles';
import {AppOptions} from '../app';

export const Emitter = toMixin(base => class Emitter extends base {

  eventList = [];
  eventQueue;
  lastEmitterStats = {};
  subscribeId = 0;
  eventTypesCache = {};

  load(options: AppOptions) {
    super.load(options);
    this.eventQueue = new BetterQueue(this.onEventQueue.bind(this), {
      concurrent: this.config.queue ? this.config.queue.events : 5,
      merge: (oldTask, newTask, cb) => {
        if (newTask.arguments && oldTask.arguments) {
          for (let i = 0; i < newTask.arguments.length; i++) {
            if (newTask.arguments[i] && oldTask.arguments[i]) {
              if (typeof oldTask.arguments[i] === 'object' && typeof newTask.arguments[i] === 'object') {
                Object.keys(newTask.arguments[i]).forEach(key => {
                  oldTask.arguments[i][key] = newTask.arguments[i][key];
                });
              }
            }
          }
        }
        cb(null, oldTask);
      },
      name: 'app-events'
    });
  }

  logPubSub(type, eventType: EventTypes, options, msg, ...optionalParams: any[]) {
    if (options && options.log === false) {
      return;
    }
    let message: any = eventType;
    let mainGroup = type;
    let group;
    let method;
    let method1;
    if (!this.eventTypesCache[type]) {
      this.eventTypesCache[type] = {};
    }
    if (!this.eventTypesCache[type][eventType]) {
      let s = eventType.split('->');
      if (s.length === 1) {
        s = eventType.split('-');
      }
      if (s.length === 1) {
        s = eventType.split('_');
      }
      if (message.indexOf('_change') !== -1 && message.indexOf('change_') !== 0) {
        s[0] = 'change';
        s[1] = message.replace('_change', '');
      } else if (s.length > 2 && message.indexOf('change_') === 0) {
        s[1] = message.substring(7);
      } else if (s.length > 2 && message.indexOf('changed_') === 0) {
        s[1] = message.substring(8);
      } else if (s.length !== 2) {
        for (let i = 2; i < s.length; i++) {
          s[1] += `-${s[i]}`;
        }
      }
      group = s[0];
      method = s[1];
      message = msg ? msg : '';
      if (options && options.instance) {
        if (!method) {
          method = options.instance;
        } else {
          method1 = options.instance;
        }
      }
      this.eventTypesCache[type][eventType] = {mainGroup, group, method, method1};
    } else {
      mainGroup = this.eventTypesCache[type][eventType].mainGroup;
      group = this.eventTypesCache[type][eventType].group;
      method = this.eventTypesCache[type][eventType].method;
      method1 = this.eventTypesCache[type][eventType].method1;
      message = msg ? msg : '';
    }
    if (optionalParams.length > 0 && optionalParams[0]) {
      switch (group) {
        case 'sensor':
          message = optionalParams[0];
          break;
        case 'status':
          message = optionalParams[0];
          break;
        case 'connected':
          // message = `${optionalParams[2].ident}`;
          break;
      }
      switch (eventType) {
        case 'device->discover':
          message = optionalParams[0];
          break;
        case 'device->connect':
          // if (optionalParams.length > 3) {
          //   method = optionalParams[3] ? 'connected' : 'not-connected';
          //   message = `${optionalParams[2].class_name}: ${optionalParams[2].ident}`;
          // }
          break;
      }
    }
    this.log(message, mainGroup, group, method, null, method1);
  }

  subscribeEx(eventType: EventTypes, listener, type, options = null) {
    this.logPubSub(type, eventType, options, null);
    let event = this.eventList.find(item => item.eventType === eventType);
    if (!event) {
      event = {eventType, listeners: [], time: 0, calls: 0, emits: 0};
      this.eventList.push(event);
    }
    this.subscribeId++;
    event.listeners.push({listener, options, id: this.subscribeId});
    if (options && options.timeout) {
      setTimeout(() => {
        const index = event.listeners.findIndex(item => item.listener === listener);
        if (index !== -1) {
          event.listeners.splice(index, 1);
        }
      }, options.timeout);
    }
    return this.subscribeId;
  }

  subscribe(eventType: EventTypes, listener, options = null) {
    return this.subscribeEx(eventType, listener, 'subscribe', options);
  }

  unsubscribe(id) {
    this.eventList.forEach(event => {
      const index = event.listeners.findIndex(item => item.id === id);
      if (index !== -1) {
        event.listeners.splice(index, 1);
      }
    })
  }

  publishEx(eventType: EventTypes, options, ...optionalParams: any[]) {
    this.logPubSub('publish', eventType, options, null, ...optionalParams);
    return new Promise((resolve, reject) => {
      let event = this.eventList.find(item => item.eventType === eventType);
      if (event) {
        event.emits++;
      }
      this.eventQueue.push({
        eventType,
        arguments: optionalParams,
        options,
        id: options && options.id ? options.id : undefined,
      }, (error, data) => {
        if (error) {
          reject(error);
        } else {
          resolve(data);
        }
      });
    });
  }

  publish(eventType: EventTypes, ...optionalParams: any[]) {
    return this.publishEx(eventType, null, ...optionalParams);
  }

  onEventQueue(input, callback) {
    let counter = 0;
    this.eventList.forEach(event => {
      if (event.eventType === input.eventType) {
        counter++;
        event.calls++;
        const time = new Date().getTime();
        event.listeners.forEach((listener) => {
          try {
            this.logPubSub('call', input.eventType, input.instance, listener.instance, ...input.arguments);
            listener.listener(...input.arguments);
          } catch (e) {
            this.error(`Emitter.onEventQueue(${event.eventType})`, e);
          }
        });
        event.time += (new Date().getTime() - time);
      }
    });
    if (counter === 0) {
      if (!input.attempt) {
        input.attempt = 0;
      }
      input.attempt++;
      if (input.attempt < 5) {
        setTimeout(() => {
          this.eventQueue.push(input);
        }, 1000);
      }
    }
    callback(null, null);
  }

  eventTypeConnected(className) {
    return `connected->${className}`;
  }

  eventTypeStatus(className, identifier = null, key = null) {
    return `status->${className}${identifier ? `->${identifier}` : ''}${key ? `->${key}` : ''}`;
  }

});
