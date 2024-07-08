import {AppOptions} from '../app';
import {toMixin} from '../../lib/foibles';
import * as os from 'os';
import {EventTypes} from '../models/event-types';

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

  cloud_ready = false;
  drivers_ready = false;
  drivers_send = false;
  devices_ready = false;
  devices_send = false;

  get url() {
    return this.config.cloud && this.config.cloud.url ? this.config.cloud.url : 'http://127.0.0.1:3000';
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
        drivers.push(opts)
      })
      this.ws.emit('register_drivers', drivers);
      this.drivers_send = true;
    }

    const registerDevices = () => {
      const devices = [];
      Object.keys(this.devices).forEach(class_name => {
        const device = this.devices[class_name];
        const opts = {
          id: device.id,
          name: device.device_name,
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
            value: cap.value,
            hidden: cap.hidden,
            disabled: cap.disabled,
          })
        });
        device.db_device.device_settings.forEach(set => {
          opts.settings.push({
            deviceId: set.device_id,
            key: set.key,
            name: set.name,
            description: set.description,
            type: set.type,
            defaultValue: set.default_value,
            params: set.params,
            value: set.value,
          })
        });
        devices.push(opts)
      })
      this.ws.emit('register_devices', devices);
      this.devices_send = true;
    }

    console.log(`connect: ${this.url}`);
    this.ws = io.connect(this.url, {transports: ['websocket']});
    this.ws.on('connect', () => {
      console.log('', 'cloud', 'receive', 'connect');
      registerGateway();
    });
    this.ws.on('disconnect', (error) => {
      console.log('', 'cloud', 'receive', 'disconnect');
      this.cloud_ready = false;
      this.drivers_send = false;
      this.devices_send = false;
    });
    this.ws.on('gateway_registered', () => {
      this.cloud_ready = true;
      if (this.drivers_ready && !this.drivers_send) {
        registerDrivers();
      }
      if (this.devices_ready && !this.devices_send) {
        registerDevices();
      }
    });
    this.ws.on('request', (data) => {
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
      }
    });

    this.subscribe(EventTypes.ApplicationDriverReady, () => {
      this.drivers_ready = true;
      if (!this.drivers_send) {
        registerDrivers();
      }
    });

    this.subscribe(EventTypes.DeviceDone, () => {
      this.devices_ready = true;
      if (!this.devices_send) {
        registerDevices();
      }
    });

  }

  updateCapabilityValues(ident, identifier, values) {
    this.ws.emit('update_device_capabilities', [{ident, identifier, values}]);
  }

});
