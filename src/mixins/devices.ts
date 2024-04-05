import {AppOptions} from '../app';
import {toMixin} from '../../lib/foibles';
import {EventTypes} from '../models/event-types';
import {DbTables} from '../models/db-tables';
import * as BetterQueue from '../../lib/better-queue/queue';
import {ConnectionStates} from '../models/connection-states';
import {checkTimeoutEx} from '../../lib/shared';

export const Devices = toMixin(base => class Devices extends base {

  devices = {};
  initCounter = {};

  load(options: AppOptions) {
    super.load(options);

    this.initDeviceQueue = new BetterQueue(this.onInitDeviceQueue.bind(this), {
      concurrent: 5,
      name: 'devices-init'
    });

    this.subscribe(EventTypes.ApplicationDriverReady, () => {
      this.loadDevices();
    });
  }

  loadDevices() {
    this.getAllItems(DbTables.Devices).then(devices => {
      let counter = 0;
      const ready = (inc = true, force = false) => {
        if (inc) {
          counter++;
        }
        if (counter === devices.length || force) {
          this.publishEx(EventTypes.DevicesInit, {id: EventTypes.DevicesInit}).then(() => {
            if (counter === 0) {
              this.publishEx(EventTypes.DeviceDone, {id: EventTypes.DeviceDone});
            }
            this.initDeviceQueue.resume();
          });
        }
      };

      devices.sort((a, b) => {
        const getSortIndex = (dbDriver) => {
          const driver = this.drivers[dbDriver.class_name];
          if (driver) {
            return driver.sort_index;
          } else {
            return 0;
          }
        }

        let numA = getSortIndex(a.driver);
        let numB = getSortIndex(b.driver);
        a.sort_index = numA;
        b.sort_index = numB;
        if (numA > numB) {
          return -1;
        } else if (numA < numB) {
          return 1;
        } else {
          return a.driver_id > b.driver_id ? 1 : (a.driver_id < b.driver_id ? -1 : 0);
        }
      });

      let devicesData = [];
      const disabledDevices = [];
      devices.forEach(device => {
        if (device.disabled) {
          disabledDevices.push({id: device.id});
        }
      });
      devices.forEach(device => {
        if (device.parent_id && disabledDevices.find(item => item.id == device.parent_id)) {
          disabledDevices.push({id: device.id});
        }
      });
      devices.forEach(device => {
        const disabled = this.config.disabledDrivers && device.driver ? this.config.disabledDrivers.find(item => item === device.driver.class_name) : false;
        if (device.driver && !device.disabled && !disabled) {
          if (!device.parent_id || !disabledDevices.find(item => item.id == device.parent_id)) {
            const parent = device.parent_id ? devices.find(item => item.id === device.parent_id) : null;
            devicesData.push({
              id: device.id,
              class_name: device.driver.class_name,
              parent_id: parent ? parent.id : null
            });
          } else {
            device.disabled = true;
          }
        } else {
          device.disabled = true;
        }
      });
      devicesData = devicesData.filter(item => !item.delete).filter(item => !item.parent_id || devicesData.find(item1 => item1.id === item.parent_id));

      const loadDevices = () => {
        devices.forEach(device => {
          if (!this.drivers[device.driver.class_name]) {
            this.log(`Driver not exists: ${device.driver.class_name}`);
            ready();
          } else if (device.driver && !this.devices[device.ident]) {
            if (!device.disabled) {
              this.createDevice(device.driver.class_name, device).then((driver: any) => {
                this.devices[device.ident] = driver;
                this.addConnectQueue(driver.initMethod ? driver.initMethod : 'init', driver, true);
                ready();
              }).catch((error) => {
                this.error(error);
                ready();
              });
            } else {
              ready();
            }
          } else {
            ready();
          }
        });
        ready(false);
      };
      loadDevices();
    });
  }

  onInitDeviceQueue(input, callback1) {
    if (!input.device.disabledByParent) {
      if (this.initCounter[input.type] === undefined) {
        this.initCounter[input.type] = 0;
      }
      this.initCounter[input.type]++;
      this.log(`${input.ident} (${this.initCounter[input.type]})`, 'drivers', input.type, input.device.class_name);
      const time = new Date().getTime();
      const callback = (error, result, log = true, cb = true, cbError = true) => {
        this.initCounter[input.type]--;
        if (log) {
          this.log(`${input.ident} (${this.initCounter[input.type]}) ${error ? error.message : ''}`, 'drivers',
            `${input.type}-${error ? 'error' : 'done'}`, input.device.class_name, new Date().getTime() - time);
        }
        if (cb) {
          callback1(cbError ? error : null, result);
        }
      };
      input.device['last_connection_time'] = time;
      switch (input.type) {
        case 'init':
          input.device.init().then(() => {
            callback(null, null);
          }).catch((error) => {
            this.log(`ERROR: Init ${input.ident} (${new Date().getTime() - time} ms)`);
            this.addConnectQueue('connect', input.device);
            if (input.device.ip && input.device.mac_address && !input.device.disableScan) {
              this.addScanQueue(input.device, 'find');
            }
            callback(error, null, true, true, false);
          });
          break;
        case 'connect':
          input.device.getDevice().then(() => {
            input.device.setInitialized(ConnectionStates.Connected).then(() => {
              callback(null, null);
            });
          }).catch((error) => {
            input.device.setInitialized(ConnectionStates.Disconnected).then(() => {
            });
            this.error(`${input.device.ident}.connectQueue`, error);
            this.addConnectQueue('connect', input.device);
            callback(error, null);
          });
          break;
        case 'connectEx':
          input.device.connect().then(() => {
            input.device.setInitialized(ConnectionStates.Connected).then(() => {
              this.publishEx('device-connect', input.device, true, null, input.device.checkLastConnect());
            });
            callback(null, null);
          }).catch((error) => {
            input.device.setInitialized(ConnectionStates.Disconnected).then(() => {
              this.publishEx('device-connect', input.device, false, null, input.device.checkLastConnect());
            });
            if (!error || !error.ignore) {
              input.device.error(error);
            }
            this.addConnectQueue(input.type, input.device);
            callback(error, null);
          });
          break;
        default:
          const method = input.device[input.type].bind(input.device);
          method().then(() => {
            callback(null, null);
          }).catch((error) => {
            const timeout = error && error.code === 'DEVICE_INSTANCE_NOT_FOUND' ? 1000 : 60000;
            this.addConnectQueue(input.type, input.device, false, timeout);
            callback(error, null);
          });
      }
    } else {
      callback1(null, null);
    }
  }

  addConnectQueue(type, device, force = false, timeout = 60000, start = 0) {
    this.log(`addConnectQueue->try ${type} ${device.className} ${device.ident} ${force}`)
    checkTimeoutEx(device, 'last_connection_time', () => {
      this.initDeviceQueue.push({
        type,
        device,
        ident: device.ident,
        id: device.ident
      }, () => {
        this.log(`addConnectQueue->done ${type} ${device.className} ${device.ident} ${force}`)
      });
    }, timeout, force);
  }

  createDevice(name, device) {
    return new Promise((resolve, reject) => {
      if (!this.drivers[name]) {
        return reject();
      }
      try {
        const driver = new this._drivers[name](this, device, {
          template: this._templates[name],
          sub_device: this._sub_devices[name]
        });
        resolve(driver);
      } catch (e) {
        reject(e);
      }
    });
  }

});
