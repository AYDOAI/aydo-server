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
    });
    this.ws.on('gateway_registered', () => {
      this.cloud_ready = true;
      registerDrivers();
    });

    this.subscribe(EventTypes.ApplicationDriverReady, () => {
      this.driver_ready = true;
      if (this.cloud_ready) {
        registerDrivers();
      }
    })
  }

});
