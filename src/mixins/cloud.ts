import {AppOptions} from '../app';
import {toMixin} from '../../lib/foibles';
import * as os from 'os';
import {EventTypes} from '../models/event-types';
import {DbTables} from '../models/db-tables';
import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';

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
  coreUpdateAvailable = false;
  coreUpdateVersion = null;
  coreUpdateUrl = null;
  coreUpdateInProgress = false;

  get url() {
    return this.config.cloud && this.config.cloud.url ? this.config.cloud.url : 'https://cloud.aydo.ai';
  }

  get active() {
    return true;
  }

  load(options: AppOptions) {
    super.load(options);
    this.register();

    if (this.config.core?.updateOnStart) {
      this.checkForCoreUpdate();
      this.checkForPluginUpdates();
      setTimeout(() => {
        this.restart(100);
      }, 2000);
    }
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

    this.ws.on('components_updated', async () => {
      await this.checkForCoreUpdate();
      await this.checkForPluginUpdates();

      setTimeout(() => {
        this.restart(100);
      }, 2000);

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
        case 'destroy':
          this.destroyGateway().then(data => {
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

    const currentTime = new Date().getTime();
    const updateThreshold = this.config.capability?.threshold || 10000;

    if (!this.deviceCapabilitiesLastUpdate ||
      (currentTime - this.deviceCapabilitiesLastUpdate) > updateThreshold) {
      this.ws.emit('update_device_capabilities', this.deviceCapabilities);
      this.deviceCapabilities = [];
      this.deviceCapabilitiesLastUpdate = currentTime;
    }
  }

  updateDeviceState(ident: string, state: boolean) {
    this.ws.emit('update_device_state', { ident, state });
  }

  async registerDrivers(force = false) {
    clearTimeout(this.driversUpdateTimeout);

    const registerDrivers = async () => {
      const drivers = [];

      for (const class_name of Object.keys(this.drivers)) {
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

        if (class_name === 'zigbee2mqtt') {
          const setting = opts.settings.find(i => i.key === 'port');
          if (setting) {
            setting.items = await this.searchSerialDevices();
          }
        }

        drivers.push(opts);
      }

      console.log('register_drivers', drivers);
      this.ws.emit('register_drivers', drivers);
      this.driversSend = true;
    };

    if (force) {
      await registerDrivers();
    } else {
      this.driversUpdateTimeout = setTimeout(async () => {
        await registerDrivers();
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
        settings: [],
        isOnline: device?.current_status?.connected
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

  async searchSerialDevices() {
    const devices = [];

    const manufacturers = [
      "texas instruments",
      "ti",
      "silicon labs",
      "silicon labs cp210x",
      "cp210x",
      "cp2102",
      "cp2104",
      "dresden elektronik ingenieurtechnik gmbh",
      "dresden elektronik",
      "tube's zb coordinator",
      "tube's zigbee",
      "nortek",
      "gocontrol",
      "nortek security & control",
      "itead",
      "sonoff",
      "electrolama",
      "zzh",
      "ikea",
      "ikea of sweden",
      "aeotec",
      "aeon labs",
      "phoscon"
    ];

    const vendors = [
      "0451", // Texas Instruments (TI)
      "10c4", // Silicon Labs
      "1cf1", // Dresden Elektronik (ConBee)
      "1a86", // Electrolama (zzh) and other devices based on CH340
      "0403", // FTDI (used in some Zigbee devices)
      "0681", // Tube's Zigbee Gateways
      "0658", // Nortek (Zigbee + Z-Wave USB sticks)
      "0457", // ITEAD (Sonoff Zigbee USB Dongle)
      "04d8", // IKEA TRÅDFRI USB Gateway
      "037a", // Aeotec
      "16c0"  // Some custom Zigbee devices
    ]

    const fs = require('fs');
    const {SerialPort} = require('serialport');
    const ports = await SerialPort.list();

    console.log('Serial devices:');

    if (fs.existsSync('/dev/ttyAML2')) {
      const isAlreadyListed = ports.some(port => port.path === '/dev/ttyAML2');
      if (!isAlreadyListed) {
        console.log('Adding /dev/ttyAML2 to the list of devices');
        devices.push({
          id: '/dev/ttyAML2',
          title: '/dev/ttyAML2, Amlogic UART',
        });
      }
    }

    ports.forEach(port => {
      console.log('Port:', port);

      const manufacturer = port.manufacturer ? port.manufacturer.toLowerCase() : '';
      const vendorId = port.vendorId ? port.vendorId.toLowerCase() : '';

      if (manufacturers.includes(manufacturer) || vendors.includes(vendorId)) {
        devices.push({
          id: port.path,
          title: `${port.path}, ${port.manufacturer}, ${port.vendorId}`,
        });
      }
    });

    console.log('Filtered devices:', devices);
    return devices;
  }

  async checkForCoreUpdate() {
    console.log('Checking for core updates');
    if (this.coreUpdateInProgress) {
      console.log('The core update is already in progress, skipping the check.');
      return;
    }

    try {
      const response = await this.cloudRequest('/backend/v2/components/latest');

      if (!response || !response.version) {
        console.log('Failed to retrieve core version information.');
        return;
      }

      console.log(`Current version: ${this.version}, availiable version: ${response.version}`);


      if (response.version !== this.version) {
        this.coreUpdateAvailable = true;
        this.coreUpdateVersion = response.version;
        this.coreUpdateUrl = response.url;

        this.publish(EventTypes.ApplicationCoreUpdateAvailable, {
          currentVersion: this.version,
          newVersion: response.version,
          url: response.url
        });


        await this.updateCore(response.version, response.url);
      } else {
        this.coreUpdateAvailable = false;
      }
    } catch (error) {
      console.error('Error while checking for core updates:', error);
    }
  }


  async checkForPluginUpdates() {
    console.log('Check for plugin updates');

    try {
      const response = await this.cloudRequest('/backend/v2/components/latest');

      if (!response || !Array.isArray(response.plugins)) {
        console.log('Failed to retrieve plugin information');
        return;
      }


      if (response.plugins.length > 0) {
        await this.updatePlugins(response.plugins);
      }
    } catch (error) {
      console.error('Error while checking for plugin updates:', error);
    }
  }

  async cloudRequest(endpoint: string, method: string = 'GET', data: any = null) {
    try {
      const url = new URL(endpoint, this.url);
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Server-ID': this.identifier,
          'X-Auth-Token': this.token
        },
        body: data ? JSON.stringify(data) : undefined
      };

      const response = await fetch(url.toString(), options);
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error in cloudRequest:', error);
      throw error;
    }
  }

  async updateCore(version: string, url: string) {
    if (this.coreUpdateInProgress) {
      console.log('The core update is already in progress.');
      return;
    }

    this.coreUpdateInProgress = true;

    try {
      const updatePath = this.config.core?.updatePath || path.join(os.homedir(), '.aydo', 'updates');
      if (!fs.existsSync(updatePath)) {
        fs.mkdirSync(updatePath, { recursive: true });
      }

      const updateFile = path.join(updatePath, `aydo-server-${version}.zip`);

      await this.downloadFile(url, updateFile);
      if (this.config.core?.backupBeforeUpdate) {
        await this.backupCore();
      }


      await this.installUpdate(updateFile);

      this.coreUpdateInProgress = false;
    } catch (error) {
      console.log('The core update is already in progress.');
      this.coreUpdateInProgress = false;
    }
  }

  async downloadFile(url: string, destination: string): Promise<void> {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`File download from ${url} error: ${response.status}`);
      }

      const fileStream = fs.createWriteStream(destination);
      const buffer = await response.arrayBuffer();

      return new Promise((resolve, reject) => {
        fileStream.write(Buffer.from(buffer));
        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });
        fileStream.on('error', (error) => {
          fs.unlink(destination, () => {});
          reject(error);
        });
        fileStream.end();
      });
    } catch (error) {
      console.error(`File download from ${url} error:`, error);
      fs.unlink(destination, () => {});
      throw error;
    }
  }

  async backupCore(): Promise<void> {
    const backupPath = path.join(os.homedir(), '.aydo', 'backups');
    if (!fs.existsSync(backupPath)) {
      fs.mkdirSync(backupPath, { recursive: true });
    }

    const backupFile = path.join(backupPath, `aydo-server-backup-${this.version}-${Date.now()}.zip`);


    return new Promise((resolve, reject) => {
      const workDir = process.cwd();
      const cmd = `cd "${workDir}" && zip -r "${backupFile}" . -x "node_modules/*" "*.git*"`;

      child_process.exec(cmd, (error) => {
        if (error) {
          console.error('Error while creating a backup', error);
          reject(error);
        } else {
          console.log(`Backup created: ${backupFile}`);
          resolve();
        }
      });
    });
  }

  async installUpdate(updateFile: string): Promise<void> {
    console.log(`Installing update from file ${updateFile}`);

    return new Promise((resolve, reject) => {
      const workDir = process.cwd();
      const tempDir = path.join(os.tmpdir(), `aydo-update-${Date.now()}`);

      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const extractCmd = `unzip -o "${updateFile}" -d "${tempDir}"`;

      child_process.exec(extractCmd, (extractError) => {
        if (extractError) {
          console.error('Error while extracting the update:', extractError);
          reject(extractError);
          return;
        }

        const copyCmd = `cp -R "${tempDir}/"* "${workDir}/"`;

        child_process.exec(copyCmd, (copyError) => {
          if (copyError) {
            console.error('Error while copying update files:', copyError);
            reject(copyError);
            return;
          }

          const installCmd = `cd "${workDir}" && npm install`;

          child_process.exec(installCmd, (installError) => {
            if (installError) {
              console.error('Error while installing dependencies:', installError);
              reject(installError);
              return;
            }


            fs.rm(tempDir, { recursive: true, force: true }, (rmError) => {
              if (rmError) {
                console.warn('Error while deleting temporary directory:', rmError);
              }
              resolve();
            });
          });
        });
      });
    });
  }

  async updatePlugins(plugins: any[]) {
    try {
      const updatePath = this.config.plugins?.updatePath || path.join(os.homedir(), '.aydo', 'plugin-updates');
      if (!fs.existsSync(updatePath)) {
        fs.mkdirSync(updatePath, { recursive: true });
      }

      const pluginsDir = '/srv/plugins';
      if (!fs.existsSync(pluginsDir)) {
        fs.mkdirSync(pluginsDir, { recursive: true });
      }

      if (this.config.plugins?.backupBeforeUpdate) {
        await this.backupPlugins();
      }

      for (const plugin of plugins) {
        if (!plugin.url || !plugin.name || !plugin.version) {
          continue;
        }

        console.log(`Plugin update ${plugin.name} to version ${plugin.version}`);

        const pluginFile = path.join(updatePath, `${plugin.name}-${plugin.version}.zip`);


        await this.downloadFile(plugin.url, pluginFile);


        const tempDir = path.join(os.tmpdir(), `plugin-update-${plugin.name}-${Date.now()}`);
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }


        await new Promise<void>((resolve, reject) => {
          const extractCmd = `unzip -o "${pluginFile}" -d "${tempDir}"`;

          child_process.exec(extractCmd, (extractError) => {
            if (extractError) {
              console.error(`Error while unpacking the plugiт ${plugin.name}:`, extractError);
              reject(extractError);
              return;
            }

            const copyCmd = `cp -f ${tempDir}/*.js ${pluginsDir}/ && cp -f ${tempDir}/*.json ${pluginsDir}/`;

            child_process.exec(copyCmd, (copyError) => {
              if (copyError) {
                console.error(`Error while copying plugin files ${plugin.name}:`, copyError);
                reject(copyError);
                return;
              }


              fs.rm(tempDir, { recursive: true, force: true }, (rmError) => {
                if (rmError) {
                  console.warn(`Error while deleting the temporary directory for the plugin ${plugin.name}:`, rmError);
                }
                resolve();
              });
            });
          });
        });

        console.log(`Plugin ${plugin.name} successfully updated to version ${plugin.version}`);
      }

    } catch (error) {
      console.error('Error while updating plugins', error);
    }
  }


  async backupPlugins(): Promise<void> {
    console.log('Creating a backup of plugins');

    const backupPath = path.join(os.homedir(), '.aydo', 'plugin-backups');
    if (!fs.existsSync(backupPath)) {
      fs.mkdirSync(backupPath, { recursive: true });
    }

    const backupFile = path.join(backupPath, `plugins-backup-${Date.now()}.zip`);
    const pluginsDir = '/srv/plugins';

    return new Promise<void>((resolve, reject) => {
      if (!fs.existsSync(pluginsDir)) {
        console.log('Plugin directory not found, skipping backup');
        resolve();
        return;
      }

      const cmd = `cd "${pluginsDir}" && zip -r "${backupFile}" .`;

      child_process.exec(cmd, (error) => {
        if (error) {
          console.error('Error while creating a backup of plugins:', error);
          reject(error);
        } else {
          console.log(`Plugin backup created: ${backupFile}`);
          resolve();
        }
      });
    });
  }
});
