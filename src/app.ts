import * as path from 'path';

import {toExtendable, Extendable, Mixin} from '../lib/foibles';
import {RequireEx} from '../lib/require-ex';
import {getDeviceIdent} from '../lib/shared';
import * as BetterQueue from '../lib/better-queue/queue';

import {Controllers} from './controllers';

import {ConfigFile} from './models/config-file';
import {EventTypes} from './models/event-types';
import {DbTables} from './models/db-tables';

import {Config} from './mixins/config';
import {Log} from './mixins/log';
import {Database} from './mixins/database';
import {RestApi} from './mixins/rest-api';
import {Emitter} from './mixins/emitter';
import {Drivers} from './mixins/drivers';
import {Devices} from './mixins/devices';
import {IPC} from './mixins/ipc';
import {Cloud} from './mixins/cloud';

const Base = toExtendable(class BaseClass {

  load(options: AppOptions) {
  }

  terminate() {
  }

});

type Base = Extendable<typeof Base>;
type Config = Mixin<typeof Config>;
type Database = Mixin<typeof Database>;
type Emitter = Mixin<typeof Emitter>;
type Log = Mixin<typeof Log>;
type RestApi = Mixin<typeof RestApi>;
type Drivers = Mixin<typeof Drivers>;
type Devices = Mixin<typeof Devices>;
type Cloud = Mixin<typeof Cloud>;

export interface AppOptions {
  requireEx: RequireEx;
  config: ConfigFile;
  configPath: string;
}

// @ts-ignore
export class App extends Base.with(Config, Database, Emitter, Log, RestApi, Drivers, Devices, IPC, Cloud) {
  version = '3.0.0';
  requireEx: RequireEx;
  subDeviceTimeouts = {};

  load(options: AppOptions) {
    this.requireEx = options.requireEx;
    this.controllers = new Controllers(this);

    this.mqtt = require('mqtt').connect(`mqtt://127.0.0.1`);

    this.subDevicesQueue = new BetterQueue((input, callback) => {
      try {
        input.ident = getDeviceIdent(input.ident);
        if (!input.params) {
          input.params = {};
        }
        if (!input.params.parent_id && input.parent) {
          input.params.parent_id = input.parent.db_device.id
        }
        if (!input.user_id && input.parent) {
          input.user_id = input.parent.db_device.user_id
        }
        if (this.driverExists(input.model)) {
          let exists = false;
          const keys = Object.keys(this.devices);
          keys.sort();
          keys.forEach(key => {
            const device = this.devices[key];
            // console.log(input.ident, key, input.ident === key, device.dbDevice.driver.class_name, input.model, device.dbDevice.driver.class_name === input.model);
            if (!exists && device.dbDevice && device.dbDevice.driver && device.dbDevice.driver.class_name === input.model) {
              exists = input.ident === key;
              if (exists) {
                // keys;
                if (input.params) {
                  const options: any = {};
                  let changed = device.updateDeviceParams(input.params);
                  if (changed) {
                    options.params = device.dbDevice.params;
                  }

                  if ((!device.dbDevice.zone_id || !device.dbDevice.zone || device.dbDevice.zone.deleted_at) && input.zone_id) {
                    options.zone_id = input.zone_id;
                    changed = true;
                  }
                  if (changed) {
                    this.app.updateItem(DbTables.Devices, options, {
                      id: device.dbDevice.id,
                    }).then((data) => {
                      callback(null, device.dbDevice);
                    }).catch((error) => {
                      callback(error, null);
                    });
                  } else {
                    callback(null, device.dbDevice);
                  }
                } else {
                  callback(null, null);
                }
              }
            }
          });
          if (!exists) {
            if (this.devices[input.ident]) {
              const device = this.devices[input.ident];
              const options = {driver_id: this.drivers[input.model].db_driver.id};
              this.updateItem(DbTables.Devices, options, {
                id: device.db_device.id,
              }).then((data) => {
                if (input.params.capabilities) {
                  device.updateCapabilities(input.params.capabilities);
                }
                callback(null, data);
              }).catch((error) => {
                callback(error, null);
              });
            } else if (!this.database.devices.items.find(item => item.ident === input.ident && !item.deleted_at)) {
              const icon = this.drivers[input.model].icon;
              if (!input.name) {
                input.name = this.drivers[input.model].driver_name;
              }
              const params = Object.assign({icon}, input.params);
              const driver_id = this.drivers[input.model].db_driver.id;
              this.createSubDevice(input.class_name, input.ident, input.name, driver_id, params, input.zone_id, input.parent, input.user_id).then((device: any) => {
                let params;
                try {
                  params = JSON.parse(device.params);
                } catch (e) {
                  this.app.error(e)
                }
                // this.app.ws.sendToAll('notify', {
                //   system: true,
                //   type: 'device-create',
                //   device: {id: device.id, name: device.name, icon: params ? params.icon : null, zone_id: device.zone_id}
                // });
                callback(null, device);
              }).catch(error => {
                callback(error, null);
              });
            } else {
              callback({code: 'disabled', message: `${input.ident} device disabled`}, null);
            }
          } else if (!exists) {
            callback({message: `${input.ident} device not found`}, null);
          }
        } else {
          if (!this.subDevices[input.model]) {
            this.subDevices[input.model] = true;
            this.log(`${input.model} class not exists`);
          }
          callback({message: `${input.model} class not exists`}, null);
        }
      } catch (e) {
        this.error('subDevicesQueue', e);
        callback(e);
      }
    }, {maxTimeout: 30000, name: 'subdevices'});

    super.load(options);
  }

  terminate() {
    super.terminate();
  }

  findDriverByClassName(class_name) {
    let result = null;
    const drivers = this.drivers;
    Object.keys(drivers).forEach(key => {
      if (drivers[key].class_name === class_name) {
        result = drivers[key];
      }
    });
    return result;
  }

  findDeviceById(id) {
    let result = null;
    Object.keys(this.devices).forEach(key => {
      if (this.devices[key].db_device.id === id) {
        result = this.devices[key];
      }
    });
    return result;
  }

  applicationPath(root, needRoot = false) {
    let length = 0;
    switch (__dirname.split(path.sep).pop()) {
      case 'dist':
        length++;
        break;
      case 'src':
        length += needRoot ? 1 : -1;
        break;
    }
    // length += __dirname.split(path.sep).pop() === 'src' ? 0 : (root.split(path.sep).length - __dirname.split(path.sep).length);
    length += root.split(path.sep).length - __dirname.split(path.sep).length;
    if (length < 0) {
      length = 0;
    }
    let result = needRoot ? path.join(root, '../'.repeat(length)) : '../'.repeat(length);
    if (__dirname.split(path.sep).pop() === 'src') {
      result = `${process.cwd()}/${result}`;
//      result = `./${result}`;
    }
    return result;
  }

  checkSubDevice(class_name, ident, model, name, params, zone_id, parent) {
    return new Promise((resolve, reject) => {
      this.log(`${ident}`, 'drivers', 'check-sub-device', class_name);
      this.subDevicesQueue.push({
        class_name, ident, model, name, params, zone_id, parent
      }, (error, result) => {
        if (error) {
          reject(error);
        } else {
          this.publishEx(EventTypes.DeviceCheckSubDevice, {id: `${EventTypes.DeviceCheckSubDevice}->${ident}`}, result.id, {
            ident,
            params
          });
          resolve(result);
        }
      });
    });
  }

  createSubDevice(class_name, ident, name, driver_id, params, zone_id = null, parent = null, user_id = null) {
    return new Promise((resolve, reject) => {
      this.createItem(DbTables.Devices, {
        ident: ident,
        name: name,
        kind: 3,
        driver_id: driver_id,
        // params: JSON.stringify(params, null, 2),
        zone_id,
        user_id,
        parent_id: params.parent_id,
        identifier: params.identifier
      }).then((data) => {
        this.publishEx(EventTypes.DeviceCreate, {id: `${EventTypes.DeviceCreate}->${ident}`}, data);
        clearTimeout(this.subDeviceTimeouts[ident]);
        this.subDeviceTimeouts[ident] = setTimeout(() => {
          // @ts-ignore
          this.publishEx(this.event_type_connected(class_name), {id: `${this.event_type_connected(class_name)}->${ident}`}, parent);
          // this.restart();
        }, 5000);
        resolve(data);
      }).catch((error) => {
        reject(error);
      });
    });
  }

  driverExists(name) {
    return !!this.drivers[name];
  }

  require(ident, require1 = false) {
    return new Promise((resolve) => {
      resolve(require(ident))
    });
  }

  newDevice(user_id: number, body: any) {
    return new Promise((resolve, reject) => {
      const driver = this.findDriverByClassName(body.class_name);
      try {
        if (driver && driver.validateParams(body.params)) {
          body.driver_id = driver.db_driver.id;
          // @ts-ignore
          delete body.class_name;
          body.user_id = user_id;
          this.createItem(DbTables.Devices, body).then((data) => {
            this.newDeviceSettings(driver, data.id, body.settings).then(() => {
              this.publishEx(EventTypes.DeviceCreate, {id: `${EventTypes.DeviceCreate}->${data.id}`}, {
                id: data.id,
                user_id: body.user_id,
                driver_id: body.driver_id,
              }).then(() => {
                this.devicesCache = null;
                // this.restart();
                resolve(data);
              });
            });
          }).catch(error => {
            reject(error);
          })
        } else if (driver) {
          reject({message: 'Validation error.'});
        } else {
          reject({message: 'Driver not found.'});
        }
      } catch (e) {
        reject(e);
      }
    })
  }

  restart() {
    clearTimeout(this.restartTimeout);
    this.restartTimeout = setTimeout(() => {
      process.exit();
    }, 10000);
  }

  newDeviceSettings(driver, device_id, settings) {
    return new Promise((resolve, reject) => {
      if (settings) {
        const where = {device_id};
        this.getItem(DbTables.DeviceSettings, where, true).then(data => {
          const promises = [];
          if (!data) {
            driver.driver_settings.forEach(setting => {
              const body = Object.assign({device_id}, setting);
              body.value = settings[setting.key];
              if (!body.description) {
                body.description = '';
              }
              if (!body.default_value) {
                body.default_value = '';
              }
              if (!body.params) {
                body.params = '{}';
              }
              promises.push(this.createItem(DbTables.DeviceSettings, body));
            });
          }
          Promise.all(promises).then(data => {
            resolve(data);
          }).catch(error => {
            reject(error);
          })
        }).catch(error => {
          reject(error);
        });
      } else {
        resolve({});
      }
    });
  }

}