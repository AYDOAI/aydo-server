'use strict';

import EventEmitter = require('events');
import {ConnectionStates} from '../models/connection-states';
import {EventTypes} from '../models/event-types';
import {Queue} from './mixins/queue';
import {Connect} from './mixins/connect';
import {Event} from './mixins/event';
import {DeviceFunctions} from './mixins/device-functions';
import {DeviceDisplay} from './mixins/device-display';
import {Settings} from './mixins/settings';
import {DbTables} from '../models/db-tables';

const {toExtendable} = require('../../lib/foibles');

const Base = toExtendable(class BaseDriver extends EventEmitter {

});

export const BaseDriver = toExtendable(class BaseDriver extends Base.with(Queue, Connect, Event, DeviceFunctions, DeviceDisplay, Settings) {

  plugin_template;
  plugin_sub_device;
  app;
  db_device: any;
  db_driver: any = null;
  name: string;
  current_status = {};

  constructor(app, device, options) {
    super(app, device, options);
    this.setMaxListeners(2000);
    this.app = app;
    this.db_device = device;
    this.name = device ? device.name : '';
    if (options && options.template) {
      this.plugin_template = options.template;
      this.plugin_sub_device = options.sub_device;
    }
    this.onCreate();
  }

  _connectionState: number = 0;

  get connectionState(): ConnectionStates {
    if (this._connectionState & 2 && this._connectionState & 8) {
      return ConnectionStates.Disconnected;
    } else if (this._connectionState & 4 && this._connectionState & 2 && this._connectionState & 1) {
      return ConnectionStates.Connected;
    } else if (this._connectionState & 4) {
      return ConnectionStates.ConnectedNotInitialized;
    } else if (this._connectionState & 2 && this._connectionState & 1) {
      return ConnectionStates.DeviceInitialized;
    } else if (this._connectionState & 1) {
      return ConnectionStates.Initialized;
    } else if (this._connectionState === 0) {
      return ConnectionStates.Undefined;
    } else {
      return ConnectionStates.Undefined;
    }
  }

  get id() {
    return this.db_device ? this.db_device.id : null;
  }

  get driver_id() {
    return this.db_driver ? this.db_driver.id : null;
  }

  get device_name() {
    return this.db_device ? this.db_device.name : null;
  }

  get driver_name() {
    return this.db_driver ? this.db_driver.name : null;
  }

  get ident() {
    return this.db_device && this.db_device.ident ? this.db_device.ident : this.db_device.id;
  }

  get capabilities() {
    return this.db_device.device_capabilities;
  }

  get driver_settings() {
    return [];
  }

  destroyDevice() {
    if (this.device) delete this.device;
  }

  setInitialized(value) {
    return new Promise((resolve, reject) => {
      switch (value) {
        case ConnectionStates.Initialized:
          this._connectionState |= 1;
          break;
        case ConnectionStates.DeviceInitialized:
          this._connectionState |= 2;
          break;
        case ConnectionStates.Connected:
          this._connectionState |= 4;
          if (this._connectionState & 8) {
            this._connectionState ^= 8;
          }
          break;
        case ConnectionStates.Disconnected:
          this._connectionState |= 8;
          if (this._connectionState & 4) {
            this._connectionState ^= 4;
          }
          break;
        default:
          console.log(this._connectionState, value);
      }

      if (this.connectionState === ConnectionStates.Connected && this.ip && this.ip !== '127.0.0.1' && !this.mac_address && !this.disableScan) {
        this.app.addScanQueue(this, 'save');
      }

      if (!this.eventDone && (this.connectionState === ConnectionStates.Connected || this.connectionState === ConnectionStates.Disconnected)) {
        this.eventDone = true;
        this.app.publishEx(EventTypes.DeviceDone, {id: `${EventTypes.DeviceDone}->${this.id}`}, {ident: this.ident}).then(() => {
          resolve({});
        }).catch(error => {
          reject(error);
        });
      } else {
        resolve({});
      }
    })
  }

  routes(router) {

  }

  init() {
    return new Promise((resolve, reject) => {
      if (this.connectionState === ConnectionStates.Connected) {
        return resolve(this.device);
      }
      this.onInitEx().then(() => {
        this.getDevice().then((device) => {
          if (device) {
            this.setInitialized(ConnectionStates.Connected).then(() => {
              resolve(device);
            }).catch(e => {
              reject(e)
            });
          } else {
            resolve(device);
          }
        }).catch((error) => {
          this.setInitialized(ConnectionStates.Disconnected).then(() => {
            reject(error);
          });
        });
      }).catch(error => {
        reject(error);
      });
    });
  }

  onCreate() {

  }

  onInitEx() {
    return new Promise((resolve, reject) => {
      if (this.db_device) {
        this.emit('init');
        this.onInit();
        this.updateDeviceFunctions().then(() => {
          this.setInitialized(ConnectionStates.Initialized).then(() => {
            if (this.initDeviceMethod) {
              this.app.addConnectQueue(this.initDeviceMethod, this, true);
            } else {
              this.app.log(`${this.ident} init method not defined`)
              this.app.addConnectQueue('connectEx', this, true);
            }
          });
          resolve({});
        }).catch(error => {
          reject(error);
        });
      }
    });
  }

  onInit() {

  }

  getDeviceConnected() {
    return this.device;
  }

  getDevice() {
    return new Promise((resolve, reject) => {
      const connected = () => {
        this.setInitialized(ConnectionStates.DeviceInitialized).then(() => {
          this.app.publishEx('device-connect', this, true, null, this.checkLastConnect());
          resolve(this.device);
        });
      };

      if (this.getDeviceConnected()) {
        connected();
      } else {
        this.connect().then(() => {
          this.app.log(`${this.class_name} ${this.id} connected`);
          connected();
        }).catch((error) => {
          this.app.publishEx('device-connect', this, false, null, this.checkLastConnect());
          this.destroyDevice();
          if (!error || !error.ignore) {
            this.error(error);
          }
          reject(error);
        });
      }
    });
  }

  checkLastConnect() {
    return false;
  }

  getParams() {
    const result = {};
    this.db_device.device_settings.forEach(item => {
      result[item.key] = item.value;
    });
    return result;
  }

  checkSubDevice(model, key, name, params, zone_id = null, parent = null) {
    const key1 = key !== undefined && key !== null && key !== '' ? (params && params.force_ident ? key : `${this.ident}_${key}`) : null;
    return this.app.checkSubDevice(this.class_name, key1, model, name, params, zone_id, parent);
  }

  deviceCommand(data) {
    // this.app.log(`BaseDriver-deviceCommand(${data ? `${data.command} ${data.value}` : ''})`);
    return new Promise((resolve, reject) => {
      const onSuccess = (data) => {
        resolve(data);
      };
      const onError = (error) => {
        reject(error);
      };
      if (this.disabled) {
        resolve({});
      } else if (!this.emit(`device-command-${data.command}`, data, onSuccess, onError)) {
        reject({message: `Command ${data.command} not found`});
      }
    });
  }

  getIcon() {
    return this.icon;
  }

  log(...message) {
    console.log(...arguments);
  }

  error(...message) {
    console.error(...arguments);
  }

  getParent(current = null, ident = 'parent_id', last = 'lastParent', int = true, ident2 = 'id') {
    if (!this[last]) {
      this[last] = {};
    }
    if (!current) {
      current = this;
    }
    const parent_id = int ? parseInt(current.db_device[ident]) : current.db_device[ident];
    if (!parent_id) {
      return null;
    }
    if (this[last][current.id] &&
      this[last][current.id].parent_id === parent_id &&
      this[last][current.id].parent) {
      return this[last][current.id].parent;
    }
    let result = null;
    Object.keys(this.app.devices).forEach(key => {
      const device = this.app.devices[key];
      if (device[ident2] === parent_id) {
        result = device;
      }
    });
    this[last][current.id] = {
      parent: result,
      parent_id: parent_id,
    };
    return result;
  }

  updateCapabilities(capabilities) {
    capabilities.forEach(capability => {
      const cap = this.db_device.device_capabilities.find(item => item.ident === capability.ident && ((!capability.index && item.index === '') || item.index == capability.index));
      if (!cap) {
        capability.device_id = this.db_device.id;
        capability.index = capability.index ? capability.index : '';
        capability.name = capability.name ? capability.name : '';
        capability.display_name = capability.display_name ? capability.display_name : '';
        capability.value = capability.value ? capability.value : '';
        capability.hidden = capability.hidden ? capability.hidden : false;
        capability.disabled = capability.disabled ? capability.disabled : false;
        capability.options = JSON.stringify(capability.options ? capability.options : {});
        capability.params = JSON.stringify(capability.params ? capability.params : {});
        this.app.createItem(DbTables.DeviceCapabilities, capability).then(() => {
        }).catch(error => {
          this.error(error);
        });
      }
    })
  }

});