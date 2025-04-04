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

  updateInProgress = false;
  coreUpdateAvailable = false;
  coreUpdateVersion = null;
  coreUpdateUrl = null;
  coreUpdateDownloadedPath: string | null = null;
  pendingPluginUpdates: any[] | null = null;
  downloadedPluginUpdates: { name: string; version: string; filePath: string; url: string; }[] = [];

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
      this.applyUpdatesAndRestart();
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

    this.ws.on('force_update_components', async () => {
      await this.applyUpdatesAndRestart();
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
        isOnline: device?.current_status?.connected,
        setupRequired: driver.class_name === 'zigbee2mqtt.subdevice' &&
            (device.db_device.setup_required !== undefined ? device.db_device.setup_required : true)
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

  // --- Update logic ---
  async applyUpdatesAndRestart() {
    if (this.updateInProgress) {
      console.log('Update process already running, skipping.');
      return;
    }

    this.updateInProgress = true;
    console.log('Starting update check and installation process...');
    let restartNeeded = false;

    try {
      const coreCheckResult = await this.checkForCoreUpdate();
      const pluginCheckResult = await this.checkForPluginUpdates();

      if (coreCheckResult && this.coreUpdateDownloadedPath && this.coreUpdateVersion) {
        console.log(`Core update to version ${this.coreUpdateVersion} found. Attempting installation...`);
        const coreInstallSuccess = await this.installCoreUpdate(this.coreUpdateVersion, this.coreUpdateDownloadedPath);
        if (coreInstallSuccess) {
          console.log(`Core update to version ${this.coreUpdateVersion} installed successfully.`);
          restartNeeded = true;
          this.ws.emit('installed_component', { core: true, version: this.coreUpdateVersion });
          this.coreUpdateAvailable = false;
          this.coreUpdateVersion = null;
          this.coreUpdateUrl = null;
          this.coreUpdateDownloadedPath = null;
        } else {
          console.error(`Failed to install core update to version ${this.coreUpdateVersion}.`);
        }
      } else {
        console.log('No core updates found or downloaded.');
      }


      if (pluginCheckResult && this.downloadedPluginUpdates.length > 0) {
        console.log(`Found ${this.downloadedPluginUpdates.length} plugin updates. Attempting installation...`);
        const pluginInstallSuccess = await this.installPluginUpdates(this.downloadedPluginUpdates);
        if (pluginInstallSuccess) {
          console.log('Plugin updates installed successfully.');
          restartNeeded = true;
          this.downloadedPluginUpdates.forEach(plugin => {
            this.ws.emit('installed_component', { plugin: plugin.name, version: plugin.version });
          });

          this.pendingPluginUpdates = null;
          this.downloadedPluginUpdates = [];
        } else {
          console.error('Failed to install one or more plugin updates.');

        }
      } else {
        console.log('No plugin updates found or downloaded.');
      }



      if (restartNeeded) {
        console.log('Updates installed, restarting server in 1 second...');
        setTimeout(() => {
          this.terminate();
          this.restart();
        }, 1000);

        return;
      } else {
        console.log('No updates installed, restart not required.');
      }

    } catch (error) {
      console.error('Error during the update process:', error);
    } finally {
      if (!restartNeeded) {
        this.updateInProgress = false;
        console.log('Update process finished.');
      }
    }
  }


  async checkForCoreUpdate(): Promise<boolean> {
    console.log('Checking for core updates...');

    this.coreUpdateAvailable = false;
    this.coreUpdateVersion = null;
    this.coreUpdateUrl = null;
    this.coreUpdateDownloadedPath = null;

    try {
      const response = await this.cloudRequest('/backend/v2/components/latest');

      if (!response || !response.version) {
        console.log('Failed to get core version information.');
        return false;
      }

      console.log(`Current core version: ${this.version}, available version: ${response.version}`);

      if (response.version !== this.version) {
        console.log(`Core update found: ${response.version}. Downloading...`);
        this.coreUpdateVersion = response.version;
        this.coreUpdateUrl = response.url;

        const updatePath = this.config.core?.updatePath || path.join(os.homedir(), '.aydo', 'updates');
        if (!fs.existsSync(updatePath)) {
          fs.mkdirSync(updatePath, { recursive: true });
        }
        const updateFile = path.join(updatePath, `aydo-server-${this.coreUpdateVersion}.zip`);

        try {
          await this.downloadFile(this.coreUpdateUrl, updateFile);
          console.log(`Core update file ${this.coreUpdateVersion} downloaded successfully: ${updateFile}`);
          this.coreUpdateAvailable = true;
          this.coreUpdateDownloadedPath = updateFile;
          this.publish(EventTypes.ApplicationCoreUpdateAvailable, {
            currentVersion: this.version,
            newVersion: this.coreUpdateVersion,
            url: this.coreUpdateUrl
          });
          return true;
        } catch (downloadError) {
          console.error(`Error downloading core update file ${this.coreUpdateVersion}:`, downloadError);
          this.coreUpdateVersion = null;
          this.coreUpdateUrl = null;
          this.coreUpdateDownloadedPath = null;
          return false;
        }

      } else {
        console.log('Latest core version is installed.');
        return false;
      }
    } catch (error) {
      console.error('Error checking for core updates:', error);
      return false;
    }
  }

  async checkForPluginUpdates(): Promise<boolean> {
    console.log('Checking for plugin updates...');

    this.pendingPluginUpdates = null;
    this.downloadedPluginUpdates = [];
    let updatesFoundAndDownloaded = false;

    try {
      const response = await this.cloudRequest('/backend/v2/components/latest');

      if (!response || !Array.isArray(response.plugins)) {
        console.log('Failed to get plugin information.');
        return false;
      }

      if (response.plugins.length === 0) {
        console.log('No available plugins to check for updates.');
        return false;
      }

      this.pendingPluginUpdates = response.plugins;

      const pluginsDir = path.join(process.cwd(), 'plugins');
      const updatePath = this.config.plugins?.updatePath || path.join(os.homedir(), '.aydo', 'plugin-updates');
      if (!fs.existsSync(updatePath)) {
        fs.mkdirSync(updatePath, { recursive: true });
      }
      if (!fs.existsSync(pluginsDir)) {
        fs.mkdirSync(pluginsDir, { recursive: true });
      }


      for (const plugin of this.pendingPluginUpdates) {
        if (!plugin.url || !plugin.name || !plugin.version) {
          console.warn(`Skipping plugin update check due to missing data: ${JSON.stringify(plugin)}`);
          continue;
        }

        const metadataPath = path.join(pluginsDir, `${plugin.name}.json`);
        let installedVersion = null;
        if (fs.existsSync(metadataPath)) {
          try {
            const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
            const installedMetadata = JSON.parse(metadataContent);
            installedVersion = installedMetadata.version;
          } catch (readError) {
            console.error(`Error reading metadata for plugin ${plugin.name}:`, readError);
          }
        }

        if (installedVersion && installedVersion === plugin.version) {
          console.log(`Plugin ${plugin.name} is already up to date (version ${installedVersion}). Skipping download.`);
          continue;
        }

        console.log(`Update found for plugin ${plugin.name}: ${plugin.version} (installed: ${installedVersion || 'N/A'}). Downloading...`);
        const pluginFile = path.join(updatePath, `${plugin.name}-${plugin.version}.zip`);

        try {
          await this.downloadFile(plugin.url, pluginFile);
          console.log(`Plugin update file ${plugin.name} ${plugin.version} downloaded successfully: ${pluginFile}`);
          this.downloadedPluginUpdates.push({
            name: plugin.name,
            version: plugin.version,
            filePath: pluginFile,
            url: plugin.url
          });
          updatesFoundAndDownloaded = true;
        } catch(downloadError) {
          console.error(`Error downloading plugin update file ${plugin.name} ${plugin.version}:`, downloadError);
        }
      }

      if (!updatesFoundAndDownloaded) {
        console.log('No new plugin versions found or failed to download.');
      }

      return updatesFoundAndDownloaded;

    } catch (error) {
      console.error('Error checking for plugin updates:', error);
      return false;
    }
  }


  async installCoreUpdate(targetVersion: string, updateFile: string): Promise<boolean> {
    console.log(`Installing core update ${targetVersion} from file ${updateFile}`);

    try {
      if (this.config.core?.backupBeforeUpdate) {
        await this.backupCore();
      }

      const installedVersion = await this.installArchive(updateFile);

      if (installedVersion && installedVersion === targetVersion) {
        console.log(`Core version ${targetVersion} installation completed and verified successfully.`);
        return true;
      } else {
        console.error(`Core installation error: installed version (${installedVersion || 'unknown'}) does not match target (${targetVersion}).`);
        return false;
      }
    } catch (error) {
      console.error(`Critical error during core update installation ${targetVersion}:`, error);
      return false;
    }
  }


  async installPluginUpdates(pluginsToInstall: { name: string; version: string; filePath: string; url: string; }[]): Promise<boolean> {
    console.log(`Installing ${pluginsToInstall.length} plugin updates...`);
    let atLeastOneSuccess = false;
    const successfullyInstalledPlugins: { name: string; version: string }[] = [];

    try {
      const pluginsDir = path.join(process.cwd(), 'plugins');
      if (!fs.existsSync(pluginsDir)) {
        fs.mkdirSync(pluginsDir, { recursive: true });
      }

      if (this.config.plugins?.backupBeforeUpdate) {
        await this.backupPlugins();
      }

      for (const plugin of pluginsToInstall) {
        console.log(`Installing plugin ${plugin.name} version ${plugin.version} from file ${plugin.filePath}`);
        const tempDir = path.join(os.tmpdir(), `plugin-update-${plugin.name}-${Date.now()}`);
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        try {
          await new Promise<void>((resolve, reject) => {
            const extractCmd = `unzip -o "${plugin.filePath}" -d "${tempDir}"`;
            child_process.exec(extractCmd, (extractError) => {
              if (extractError) {
                console.error(`Error unzipping plugin ${plugin.name}:`, extractError);
                fs.rm(tempDir, { recursive: true, force: true }, () => reject(extractError));
              } else {
                resolve();
              }
            });
          });


          await new Promise<void>((resolve, reject) => {

            const copyCmd = `cp -f ${tempDir}/*.js "${pluginsDir}/" 2>/dev/null || true && cp -f ${tempDir}/*.json "${pluginsDir}/" 2>/dev/null || true`;
            child_process.exec(copyCmd, (copyError) => {
              if (copyError) {
                console.warn(`Possible error copying plugin files for ${plugin.name} (continuing installation):`, copyError);
              }
              resolve();
            });
          });


          const metadataPath = path.join(pluginsDir, `${plugin.name}.json`);
          try {
            if (fs.existsSync(metadataPath)) {
              const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
              const installedMetadata = JSON.parse(metadataContent);
              installedMetadata.version = plugin.version;
              fs.writeFileSync(metadataPath, JSON.stringify(installedMetadata, null, 2));
              console.log(`Metadata for plugin ${plugin.name} updated to version ${plugin.version}`);
            } else {
              console.warn(`Metadata file ${metadataPath} not found after installing plugin ${plugin.name}. Could not write version.`);
            }
          } catch (metaUpdateError) {
            console.error(`Error updating metadata for plugin ${plugin.name}:`, metaUpdateError);
          }


          console.log(`Plugin ${plugin.name} successfully updated to version ${plugin.version}`);
          successfullyInstalledPlugins.push({ name: plugin.name, version: plugin.version });
          atLeastOneSuccess = true;

        } catch (pluginInstallError) {
          console.error(`Failed to install plugin ${plugin.name} version ${plugin.version}:`, pluginInstallError);
          this.downloadedPluginUpdates = this.downloadedPluginUpdates.filter(p => !(p.name === plugin.name && p.version === plugin.version));
        } finally {

          fs.rm(tempDir, { recursive: true, force: true }, (rmError) => {
            if (rmError) {
              console.warn(`Error removing temporary directory for plugin ${plugin.name}:`, rmError);
            }
          });
        }
      }


      this.downloadedPluginUpdates = this.downloadedPluginUpdates.filter(
        downloaded => !successfullyInstalledPlugins.some(installed => installed.name === downloaded.name && installed.version === downloaded.version)
      );


    } catch (error) {
      console.error('Error during the plugin update installation process:', error);
      return false;
    }

    return atLeastOneSuccess;
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


  async downloadFile(url: string, destination: string): Promise<void> {
    console.log(`Downloading file from ${url} to ${destination}`);
    let fileStream: fs.WriteStream | null = null;
    try {
      const response = await fetch(url);

      if (!response.ok || !response.body) {
        throw new Error(`Error downloading file ${url}: ${response.status} ${response.statusText}`);
      }

      fileStream = fs.createWriteStream(destination);
      const reader = response.body.getReader();

      return new Promise(async (resolve, reject) => {
        fileStream.on('error', (error) => {
          console.error(`Error writing to file ${destination}:`, error);
          fs.unlink(destination, () => {});
          reject(error);
        });
        fileStream.on('finish', () => {
          console.log(`File ${destination} downloaded and closed successfully.`);
          resolve();
        });

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            if (!fileStream.write(value)) {
              await new Promise(resolveDrain => fileStream.once('drain', resolveDrain));
            }
          }
          fileStream.end();
        } catch (readError) {
          console.error(`Error reading stream for ${url}:`, readError);
          fileStream.close();
          fs.unlink(destination, () => {});
          reject(readError);
        }
      });

    } catch (error) {
      console.error(`Error downloading file ${url}:`, error);
      if (fileStream) {
        fileStream.close();
      }
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
    console.log(`Creating core backup at ${backupFile}`);

    return new Promise((resolve, reject) => {
      const workDir = process.cwd();
      const excludePatterns = [
        "node_modules/*",
        "*.log",
        "logs/*",
        ".pm2/*",
        ".git/*",
        path.join(os.homedir(), '.aydo', 'updates', '*'),
        path.join(os.homedir(), '.aydo', 'backups', '*'),
        path.join(os.homedir(), '.aydo', 'plugin-updates', '*'),
        path.join(os.homedir(), '.aydo', 'plugin-backups', '*')
      ];
      const excludeArgs = excludePatterns.map(p => `-x "${p}"`).join(' ');
      const cmd = `cd "${workDir}" && zip -r "${backupFile}" . ${excludeArgs}`;
      console.log(`Executing backup command: ${cmd}`);


      child_process.exec(cmd, (error, stdout, stderr) => {
        if (stderr) {
          console.warn('Warnings during backup creation:', stderr);
        }
        if (error) {
          console.error('Error creating core backup:', error);
          reject(error);
        } else {
          console.log(`Core backup created successfully: ${backupFile}`);
          resolve();
        }
      });
    });
  }


  async installArchive(archiveFile: string): Promise<string | null> {
    console.log(`Installing update from archive ${archiveFile}`);
    const workDir = process.cwd();
    const tempDir = path.join(os.tmpdir(), `aydo-install-${Date.now()}`);

    try {
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      console.log(`Unzipping ${archiveFile} to ${tempDir}...`);
      await new Promise<void>((resolve, reject) => {
        const extractCmd = `unzip -o "${archiveFile}" -d "${tempDir}"`;
        child_process.exec(extractCmd, (extractError, stdout, stderr) => {
          if (stderr) console.warn(`Stderr during unzip: ${stderr}`);
          if (extractError) {
            console.error('Error unzipping archive:', extractError);
            reject(extractError);
          } else {
            console.log('Archive unzipped successfully.');
            resolve();
          }
        });
      });

      console.log(`Copying files from ${tempDir} to ${workDir}...`);
      await new Promise<void>((resolve, reject) => {
        const copyCmd = `rsync -a --exclude node_modules --exclude .git "${tempDir}/" "${workDir}/"`;
        child_process.exec(copyCmd, (copyError, stdout, stderr) => {
          if (stderr) console.warn(`Stderr during rsync copy: ${stderr}`);
          if (copyError) {
            console.error('Error copying update files (rsync):', copyError);

            console.log('Attempting copy with cp...');
            const fallbackCopyCmd = `cp -R "${tempDir}/"* "${workDir}/"`;
            child_process.exec(fallbackCopyCmd, (fallbackError) => {
              if (fallbackError) {
                console.error('Error copying update files (cp fallback):', fallbackError);
                reject(fallbackError);
              } else {
                console.log('Files copied successfully (cp fallback).');
                resolve();
              }
            });
          } else {
            console.log('Files copied successfully (rsync).');
            resolve();
          }
        });
      });

      console.log(`Installing dependencies in ${workDir}...`);
      await new Promise<void>((resolve, reject) => {
        const installCmd = `cd "${workDir}" && npm install`;
        child_process.exec(installCmd, { maxBuffer: 1024 * 1024 * 5 }, (installError, stdout, stderr) => {
          if (stderr) console.warn(`Stderr during npm install: ${stderr}`);
          if (stdout) console.log(`Stdout during npm install: ${stdout}`);
          if (installError) {
            console.error('Error installing dependencies (npm install):', installError);
            reject(installError);
          } else {
            console.log('Dependencies installed successfully.');
            resolve();
          }
        });
      });


      let installedVersion: string | null = null;
      const packageJsonPath = path.join(workDir, 'package.json');
      try {
        const data = fs.readFileSync(packageJsonPath, 'utf8');
        const packageJson = JSON.parse(data);
        installedVersion = packageJson.version || null;
        if (installedVersion) {
          console.log(`Successfully read version from package.json after update: ${installedVersion}`);
        } else {
          console.warn('Could not find version in package.json after update.');
        }
      } catch (readErr) {
        console.error('Error reading or parsing package.json after update:', readErr);
      }

      return installedVersion;

    } catch (error) {
      console.error(`Error during installation from archive ${archiveFile}:`, error);
      throw error;
    } finally {
      console.log(`Cleaning up temporary directory ${tempDir}...`);
      fs.rm(tempDir, { recursive: true, force: true }, (rmError) => {
        if (rmError) {
          console.warn('Error removing temporary installation directory:', rmError);
        }
      });
    }
  }


  async backupPlugins(): Promise<void> {
    console.log('Creating plugin backup');

    const backupPath = path.join(os.homedir(), '.aydo', 'plugin-backups');
    if (!fs.existsSync(backupPath)) {
      fs.mkdirSync(backupPath, { recursive: true });
    }

    const backupFile = path.join(backupPath, `plugins-backup-${Date.now()}.zip`);
    const pluginsDir = path.join(process.cwd(), 'plugins');

    return new Promise<void>((resolve, reject) => {
      if (!fs.existsSync(pluginsDir)) {
        console.log('Plugins directory not found, skipping backup.');
        resolve();
        return;
      }

      const cmd = `cd "${pluginsDir}" && zip -r "${backupFile}" .`;
      console.log(`Executing plugin backup command: ${cmd}`);

      child_process.exec(cmd, (error, stdout, stderr) => {
        if (stderr) {
          console.warn('Warnings during plugin backup creation:', stderr);
        }
        if (error) {
          console.error('Error creating plugin backup:', error);
          reject(error);
        } else {
          console.log(`Plugin backup created successfully: ${backupFile}`);
          resolve();
        }
      });
    });
  }

});
