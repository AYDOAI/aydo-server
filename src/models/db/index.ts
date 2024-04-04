import {Drivers} from './drivers';
import {Users} from './users';
import {Zones} from './zones';
import {DeviceCapabilities} from './device_capabilities';
import {DeviceSettings} from './device_settings';
import {Devices} from './devices';
import {Events} from './events';
import {Rooms} from './rooms';
import {Stats} from './stats';

export class Models {
  drivers;
  devices;
  users;
  zones;
  device_capabilities;
  device_settings;
  events;
  rooms;
  stats;

  constructor(app) {
    this.drivers = new Drivers(app);
    this.users = new Users(app);
    this.zones = new Zones(app);
    this.device_capabilities = new DeviceCapabilities(app);
    this.device_settings = new DeviceSettings(app);
    this.devices = new Devices(app);
    this.events = new Events(app);
    this.rooms = new Rooms(app);
    this.stats = new Stats(app);
  }

}