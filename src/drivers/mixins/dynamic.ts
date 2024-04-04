import {spawn} from 'child_process';
import * as os from 'os';
import {removeLast} from '../../../lib/shared';
import {ConnectionStates} from '../../models/connection-states';
import {toMixin} from '../../../lib/foibles';

const path = require('path');
const fs = require('fs');

export const Dynamic = toMixin(parent => class Dynamic extends parent {

  device;
  skippedZonesLog = {};

  constructor(app, device, options) {
    super(app, device, options);
    if (device) {
      setTimeout(() => {
        this.startServer();
      })
    }
  }

  startServer() {
    this.startServerEx(this.db_device.id).then((device) => {
      this.device = device;
    }).catch(() => {
    })
  }

  startServerEx(id, restart = true) {
    return new Promise((resolve, reject) => {
      if (!this.pluginSubDevice) {
        const start = () => {
          let moduleName;
          const options: any = {maxBuffer: 50 * 1024 * 1024};
          const names: any = [{
            filename: path.join(process.cwd(), `../plugins/${this.driverModuleName}/dist/src/${this.driverModuleName}.js`),
            command: 'node',
            directory: path.join(process.cwd(), `../plugins/${this.driverModuleName}/dist/src/`),
            args: [path.join(process.cwd(), `../plugins/${this.driverModuleName}/dist/src/${this.driverModuleName}.js`), id]
          }, {
            filename: this.app.moduleName(`./plugins/${this.driverModuleName}.js`),
            command: 'node',
            args: [this.app.moduleName(`./plugins/${this.driverModuleName}.js`), id]
          }, {
            filename: this.app.moduleName(`./plugins/${this.driverModuleName}`),
            command: this.app.moduleName(`./plugins/${this.driverModuleName}`),
            args: [id]
          }];
          names.forEach(name => {
            if (!moduleName && fs.existsSync(name.filename)) {
              moduleName = name;
              if (name.directory) {
                options.cwd = name.directory;
              }
            }
          });

          this.app.log(`Start: ${moduleName.command} ${JSON.stringify(moduleName.args)}${options.cwd ? `; directory: ${options.cwd}` : ''}`)
          let device = spawn(moduleName.command, moduleName.args, options);
          this.processId = device.pid;
          const logModuleName = `${this.driverModuleName}-${this.id}`;
          device.stdout.on('data', (data) => {
            const data1 = removeLast(data.toString());
            this.app.logModule(logModuleName, data1);
            if (this.app.config.log.console === true) {
              console.log(logModuleName, data1);
            }
          });
          device.stderr.on('data', (data) => {
            const data1 = removeLast(data.toString());
            this.app.errorModule(logModuleName, data1);
            if (this.app.config.log.console === true) {
              console.log(logModuleName, data1);
            }
          });
          device.on('close', (code) => {
            this.app.log(`${logModuleName}: close (${code})`);
            device = null;
            let cmd;
            if (os.platform() === 'darwin') {
              cmd = `ps -A | grep " node " | grep "${this.driverModuleName}.js ${id}" | awk '{print $1}' | xargs kill -9 $1`
            } else {
              cmd = `ps -A -F | grep " node " | grep "${this.driverModuleName}.js ${id}" | awk '{print $2}' | xargs kill -9 $1`
            }
            this.app.log(`kill_process: ${cmd}`);
            const ps = spawn(cmd, [], {shell: true});
            ps.stdout.on('data', (data) => {
              console.log(`kill_process,stdout: ${data}`);
            });

            ps.stderr.on('data', (data) => {
              console.error(`kill_process,stderr: ${data}`);
            });

            ps.on('close', (code) => {
              console.log(`kill_process,child process exited with code ${code}`);
            });

            if (!this.app.terminating && !this.disabled && this.app.devices[this.ident] && restart) {
              delete this.device;
              this._connectionState = 0;
              this.startServer();
              setTimeout(() => {
                this.app.addConnectQueue(this.initMethod ? this.initMethod : 'init', this.app.devices[this.ident], true);
              }, 3000);
            }
          });
          setTimeout(() => {
            if (device) {
              resolve(device);
            } else {
              reject();
            }
          }, 1000);
        }
        start();
      } else {
        resolve({});
      }
    });
  }

  restartServerEx() {
    if (!this.pluginSubDevice && this.device) {
      this.app.log(`${this.ident} restartServerEx`);
      this.device.kill();
    }
  }

  updateConfig() {
    super.updateConfig();
    if (!this.pluginSubDevice && this.device && (!this.getParam('external_driver') || this.getParam('external_driver_ssh_host'))) {
      this.killTimeout = setTimeout(() => {
        this.app.log(`${this.ident} updateConfig`);
        this.device.kill();
        this.app.lastAutoUpdateStates[this.ident] = null;
      }, 3000);
      const disabled = this.disabled;
      const devices = this.app.findDevicesByParentId(this.id);
      devices.forEach(device => {
        device._disabled = disabled;
      })
    } else if (this.pluginSubDevice || this.pluginTemplate.update_config) {
      this.deviceCommand({command: 'update_settings', data: this.getParams()}).then(() => {
      }).catch(() => {
      })
    }
  }

  initDeviceEx(resolve, reject) {
    if (this.pluginSubDevice) {
      this.device = {};
      resolve({});
    } else {
      this.app.request(`driver-${this.id}`, 'init-device', {
        server_id: this.app.config.identifier,
        environment: this.app.config.environment,
        internal_port: this.app.config.port,
        internal_ip: this.app.internal_ip,
        cloud: this.app.config.cloud ? !!this.app.config.cloud.cloud : false,
        ident: this.ident,
        // params: this.db_device.getParams(),
        log_path: this.app.config.log.path,
        path: this.app.applicationPath(__dirname, true),
        pid: process.pid,
      }).then(() => {
        resolve({});
      }).catch(error => {
        reject(error);
      });
    }
  }

  connectEx(resolve, reject) {
    if (this.pluginSubDevice) {
      const check = () => {
        const result = this.parent && this.parent.connectionState === ConnectionStates.Connected;
        if (result) {
          this.connected(this.parent);
          resolve({});
        }
        return result;
      };
      if (!check()) {
        let count = 0;
        const interval = setInterval(() => {
          if (check()) {
            clearInterval(interval);
          } else {
            count++;
            if (count > 10) {
              clearInterval(interval);
              reject({
                message: `${this.driverModuleName}: Parent device ${this.parent_class_name} not ready`,
                ignore: true,
                code: 'PARENT_DEVICE_NOT_READY'
              });
            }
          }
        }, 1000);
      }
    } else {
      this.app.request(`driver-${this.id}`, 'connect-device', {}).then(() => {
        this.app.publishEx(this.app.eventTypeConnected(this.class_name), {id: `${this.app.eventTypeConnected(this.class_name)}->${this.id}`}, this);
        resolve({});
      }).catch(error => {
        reject(error);
      });
    }
  }

  commandEx(command, value, resolve, reject, options, device = undefined) {
    if (device === undefined) {
      device = this;
    }
    if (!options.ident) {
      options.ident = this.ident;
    }
    if (!options.device_id) {
      options.device_id = this.id;
    }
    if (!options.class_name) {
      options.class_name = this.class_name;
    }

    const ident = `driver-${options && options.id !== undefined ? options.id : this.id}`;
    const request = () => {
      this.app.request(ident, 'device-command', {
        command,
        value,
        options,
        status: device ? this.currentStatus : {},
        // params: device ? device.db_device.getParams() : {}
      }).then((result) => {
        if (result && result.update_settings) {
          Object.keys(result.settings).forEach(key => {
            this.setParam(key, result.settings[key]);
          });
          this.saveDeviceParams();
        } else if (result && result.update_status) {
          this.emit('update_updated_at_now');
          Object.keys(result.status).forEach(key => {
            let value = result.status[key];
            if (this.invert_power && key.indexOf('power') === 0) {
              value = !value;
            }
            device.emit(`update_${key}`, value);
          });
          if (result.force_status) {
            Object.keys(result.force_status).forEach(key => {
              this.currentStatus[key] = result.force_status[key];
            });
          }
          device.queueUpdateEx();
        } else if (device) {
          if (command.indexOf('range') === 0 && this.invert_range) {
            value = (this.rangeMax - (value - this.rangeMin));
          }
          device.emit(`update_${command}`, value);
          device.queueUpdateEx();
        }
        resolve(result);
      }).catch(error => {
        if (error && error.message && command == 'status' && !error.ignore) {
          this.app.ws.sendToAll('exception', {message: error.message})
        }
        reject(error);
      });
    }

    if (this.isCommandBeforeInit(command)) {
      const check = () => {
        const ipc = this.app.ipcClients.find(item => item.id === ident);
        if (ipc) {
          request();
        } else {
          console.log(`commandEx, wait 100 ms`);
          setTimeout(() => {
            check();
          }, 100)
        }
      }
      check();
    } else {
      request();
    }
  }

});
