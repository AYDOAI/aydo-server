import {AppOptions} from '../app';
import {toMixin} from '../../lib/foibles';
import * as os from 'os';
import {EventTypes} from '../models/event-types';
import {DbTables} from '../models/db-tables';

const io = require('socket.io-client');

export function arch() {
  let result = process.arch;
  switch (result) {
    case 'arm':
      // @ts-ignore
      if (process.config && process.config.variables && process.config.variables.arm_version) {
        // @ts-ignore
        result += `v${process.config.variables.arm_version}`
      }
      break;
  }
  return result;
}

export const Cloud = toMixin(base => class Cloud extends base {

  cloudReady = false;
  driversReady = false;
  driversSend = false;
  devicesReady = false;
  devicesSend = false;
  zonesReady = false;
  zonesSend = false;
  driversUpdateTimeout = null;
  devicesUpdateTimeout = null;
  zonesUpdateTimeout = null;
  deviceCapabilities = [];
  deviceCapabilitiesLastUpdate = null;

  get url() {
    return this.config.cloud && this.config.cloud.url ? this.config.cloud.url : 'https://cloud.aydo.ai';
  }

  get active() {
    return true;
  }

  load(options: AppOptions) {
    super.load(options);
    this.register();
  }

  register() {
    console.log(`cloud.register`);
    if (!this.active) {
      if (this.ws) {
        this.ws.off('connect');
        this.ws.off('gateway_registered');
        delete this.ws;
      }
      return;
    }

    const registerGateway = () => {
      this.ws.emit('register_gateway', {
        server_id: this.identifier,
        token: this.token,
        environment: this.config.environment,
        platform: os.platform(),
        arch: arch(),
        version: this.version
      });
    }

    console.log(`connect: ${this.url}`);
    this.ws = io.connect(this.url, {transports: ['websocket']});
    this.ws.on('connect', () => {
      console.log('', 'cloud', 'receive', 'connect');
      registerGateway();
    });

    this.ws.on('connect_error', (error: Error) => {
      console.log(`connect error: ${error.message}`);
    });

    this.ws.on('disconnect', (error) => {
      console.log('', 'cloud', 'receive', 'disconnect');
      this.cloudReady = false;
      this.driversSend = false;
      this.devicesSend = false;
      this.zonesSend = false;
    });

    this.ws.on('gateway_registered', () => {
      console.log('', 'cloud', 'receive', 'gateway', 'registered');
      this.cloudReady = true;
      if (this.driversReady && !this.driversSend) {
        this.registerDrivers();
      }
      if (this.devicesReady && !this.devicesSend) {
        this.registerDevices();
      }
      if (this.zonesReady && !this.zonesSend) {
        this.registerZones();
      }
    });

    this.ws.on('request', (data) => {
      console.log('', 'cloud', 'receive', 'request');
      console.log(data);
      const id = data.id;
      switch (data.method) {
        case 'add_device':
          this.newDevice(1, data.body).then((body) => {
            this.ws.emit('response', {id, body});
          }).catch(error => {
            this.ws.emit('response', {id, error});
          });
          break;
        case 'add_zone':
          this.newZone(1, data.body).then((body) => {
            this.ws.emit('response', { id, body });
          }).catch(error => {
            this.ws.emit('response', { id, error });
          });
          break;
        case 'device_command':
          this.deviceCommand(data.body).then((body) => {
            this.ws.emit('response', {id, body});
          }).catch(error => {
            this.ws.emit('response', {id, error});
          });
          break;
        case 'delete_device':
          this.deleteDevice(data.body.device_ident).then(data => {
            this.ws.emit('response', {id, data})
          }).catch(error => {
            this.ws.emit('response', {id, error})
          })
          break;
        case 'update_device':
          this.updateDevice(data.body).then(data => {
            this.ws.emit('response', {id, data})
          }).catch(error => {
            this.ws.emit('response', {id, error})
          })
          break;
      }
    });

    this.subscribe(EventTypes.ApplicationDriverReady, () => {
      this.driversReady = true;
      if (!this.driversSend) {
        this.registerDrivers();
      }
    });

    this.subscribe(EventTypes.DeviceDone, () => {
      this.devicesReady = true;
      if (!this.devicesSend) {
        this.registerDevices(true);
      }
    });

    this.subscribe(EventTypes.ZoneDone, () => {
      this.zonesReady = true;
      if (!this.zonesSend) {
        this.registerZones(true);
      }
    });

  }

  updateCapabilityValues(ident, identifier, values) {
    this.deviceCapabilities.push({ident, identifier, values});
    if (!this.deviceCapabilitiesLastUpdate) {
      this.deviceCapabilitiesLastUpdate = new Date().getTime();
    }
    if (new Date().getTime() - this.deviceCapabilitiesLastUpdate > 10000) {
      this.ws.emit('update_device_capabilities', this.deviceCapabilities);
      this.deviceCapabilities = [];
      this.deviceCapabilitiesLastUpdate = new Date().getTime();
    }
  }

  registerDrivers(force = false) {
    clearTimeout(this.driversUpdateTimeout)
    const registerDrivers = () => {
      const drivers = [];
      Object.keys(this.drivers).forEach(class_name => {
        const driver = this.drivers[class_name];
        const opts = {
          className: class_name,
          parentClassName: driver.parent_class_name,
          icon: driver.icon,
          name: driver.driver_name,
          driverId: driver.driver_id,
          type: driver.driver_type,
          settings: driver.driver_settings
        };

        if (class_name == 'zigbee2mqtt') {
          let setting = opts.settings.find(i => i.key == 'port');
          setting.items = this.searchSerialDevices(['Zigbee', 'Dongle']);
        }

        drivers.push(opts)
      })
      this.ws.emit('register_drivers', drivers);
      this.driversSend = true;
    }
    if (force) {
      registerDrivers();
    } else {
      this.driversUpdateTimeout = setTimeout(() => {
        registerDrivers();
      }, 5000);
    }
  }

  registerDevices(force = false) {
    clearTimeout(this.devicesUpdateTimeout);
    const registerDevices = () => {
      const devices = this.buildDevicesRO();
      this.ws.emit('register_devices', devices);
      this.devicesSend = true;
    }
    if (force) {
      registerDevices();
    } else {
      this.devicesUpdateTimeout = setTimeout(() => {
        registerDevices();
      }, 5000);
    }
  }

  buildDevicesRO() {
    const devices = [];
    Object.keys(this.devices).forEach(class_name => {
      const device = this.devices[class_name];
      const driver = this.findDriverById(device.db_device.driver_id);

      const opts = {
        name: device.name,
        ident: device.ident,
        identifier: device.identifier,
        driverId: device.db_device.driver_id,
        zoneId: device.db_device.zone_id,
        userId: device.db_device.user_id,
        parentId: device.db_device.parent_id,
        disabled: device.db_device.disabled,
        capabilities: [],
        settings: []
      };

      console.log(opts);
      console.log(JSON.stringify(opts));

      device.db_device.device_capabilities.forEach(cap => {
        opts.capabilities.push({
          deviceId: cap.device_id,
          ident: cap.ident,
          index: cap.index,
          name: cap.name,
          displayName: cap.display_name,
          unit: cap.unit,
          options: cap.options ? JSON.parse(cap.options) : null,
          params: cap.params ? JSON.parse(cap.params) : null,
          // value: cap.value,
          hidden: cap.hidden,
          disabled: cap.disabled,
        })
      });

      if (driver.class_name == 'zigbee2mqtt.subdevice') {
        opts.settings.push({
          "key": "zoneId",
          "name": "Zone",
          "type": "zone",
          "required": true
        });
      }

      device.db_device.device_settings.forEach(set => {
        const driverSetting = driver?.driver_settings?.find(setting => setting.key === set.key);
        opts.settings.push({
          deviceId: set.device_id,
          key: set.key,
          name: set.name,
          description: set.description,
          type: set.type,
          defaultValue: set.default_value,
          params: set.params,
          value: set.value,
          unique: (driverSetting && driverSetting.unique !== undefined) ? driverSetting.unique : false,
          required: driverSetting?.required,
        })
      });
      devices.push(opts)
    })
    return devices;
  }

  registerZones(force = false) {
    clearTimeout(this.zonesUpdateTimeout);
    const registerZones = () => {
      const zones = [];
      this.getAllItems(DbTables.Zones).then(db_zones => {
        db_zones.forEach(zone => {
          zones.push({
            id: zone.id,
            name: zone.name,
            location: zone.location,
            is_indoor: zone.is_indoor,
          });
        });
        this.ws.emit('register_zones', zones);
        this.zonesSend = true;
      });
    }
    if (force) {
      registerZones();
    } else {
      this.zonesUpdateTimeout = setTimeout(() => {
        registerZones();
      }, 5000);
    }
  }

  searchSerialDevices(keywords: string[]) {
    const fs = require('fs');
    const path = require('path');
    const directory = '/dev/serial/by-id';

    const devices: any = [];

    try {
      const files = fs.readdirSync(directory);
      files.forEach((file: any) => {
        const linkPath = path.join(directory, file);
        try {
          let realPath = fs.readlinkSync(linkPath);
          realPath = realPath.replace(/..\/../g, '/dev');
          const formattedDeviceName = file.replace(/_/g, ' ');
          if (keywords.some(keyword => formattedDeviceName.includes(keyword))) {
            devices.push({
              id: realPath,
              title: formattedDeviceName
            });
          }
        } catch (error) {
          console.error(`Error processing symbolic link: ${linkPath}`);
        }
      });
    } catch (err) {
      console.warn(`Directory ${directory} is not accessible. Attempting to scan /dev manually...`);

      try {
        const devFiles = fs.readdirSync('/dev');

        const regex = /tty(AML|USB|AMA|ACM|MFD)[0-9]*/;
        for (const file of devFiles) {
          if (regex.test(file)) {
            const realPath = path.join('/dev', file);
            devices.push({
              id: realPath,
              title: realPath,
            });
          }
        }
      } catch (scanError) {
        console.error('Error scanning /dev directory:', scanError);
      }
    }

    console.log('***Serial-Devices***');
    console.log(devices);

    return devices;
  }
});
