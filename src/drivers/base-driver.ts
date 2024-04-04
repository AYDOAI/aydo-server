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

  get id() {
    return this.db_device ? this.db_device.id : null;
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
            this.errorEx(error);
          }
          reject(error);
        });
      }
    });
  }

  checkLastConnect() {
    return false;
  }

});