import {spawn} from 'child_process';
import * as BetterQueue from '../../lib/better-queue/queue';
import {EventTypes} from '../models/event-types';
import {removeLast} from '../../lib/shared';
import {toMixin} from '../../lib/foibles';
import {AppOptions} from '../app';

const fs = require('fs');
const path = require('path');

export const IPC = toMixin(parent => class IPC extends parent {

  ipcClients = [];
  databaseAlreadyConnected = false;
  requestId = 0;
  requestQueue;
  ipcChild = [];
  disconnectList = {};

  load(options: AppOptions) {
    super.load(options);

    this.requestQueue = new BetterQueue(this.onRequestQueue.bind(this), {
      maxTimeout: 60000,
      concurrent: 5,
      name: 'ipc-requests'
    });

    const newIPC = () => {
      const ipc = require('node-ipc').default;

      ipc.config.id = 'app';
      ipc.config.retry = 1500;
      ipc.config.silent = true;
      ipc.config.logger = () => {
      };
      return ipc;
    };

    const ipc = newIPC();
    const handle = (ipc) => {
      ipc.server.on('connect', (p1) => {
      });
      ipc.server.on('socket.disconnected', (p1) => {
        console.log('socket.disconnected', p1.id);
        const index = this.ipcClients.findIndex(item => item.socket.id === p1.id);
        if (index !== -1) {
          const m = this.ipcClients[index].id.match(/driver-(\d+)/);
          if (m && m.length > 1) {
            const device = this.findDeviceById(parseInt(m[1]));
            if (device) {
              // this.addConnectQueue(device.initDeviceMethod, device);
            }
          }
          this.ipcClients.splice(index, 1);
          this.disconnectList[p1.id] = true;
        }
      });

      const events = [
        {
          name: 'hello',
          method: (data, socket) => {
            this.ipcClients.push({id: data.id, socket, ipc});
            if (this.databaseAlreadyConnected) {
              ipc.server.emit(socket, EventTypes.DatabaseConnected);
            }
            const m = data.id.match(/driver-(\d+)/);
            if (m && m.length > 1 && this.disconnectList[data.id]) {
              this.disconnectList[data.id] = false;
              const device = this.findDeviceById(parseInt(m[1]));
              if (device) {
                Object.keys(this.lastAutoUpdateStates).forEach((key) => {
                  if (this.lastAutoUpdateStates[key].parent_id === device.id) {
                    delete this.lastAutoUpdateStates[key];
                  }
                })
              }
            }
          },
        },
        {
          name: EventTypes.DatabaseGetAllItems,
          method: (data, socket) => {
            this.getAllItems(data.tableName).then(result => {
              ipc.server.emit(socket, EventTypes.DatabaseGetAllItems, {id: data.id, result});
            }).catch(error => {
              this.error('', error);
            });
          }
        },
        {
          name: EventTypes.DatabaseUpdateItem,
          method: (data, socket) => {
            this.updateItem(data.tableName, data.options, data.where).then(result => {
              ipc.server.emit(socket, EventTypes.DatabaseUpdateItem, {id: data.id, result});
            }).catch(error => {
              this.error('', error);
            });
          }
        },
        {
          name: EventTypes.DatabaseCreateItem,
          method: (data, socket) => {
            this.createItem(data.tableName, data.options).then(result => {
              ipc.server.emit(socket, EventTypes.DatabaseCreateItem, {id: data.id, result});
            }).catch(error => {
              this.error('', error);
            });
          }
        },
        {
          name: EventTypes.ApplicationGetDevices,
          method: (data, socket) => {
            const result = [];
            Object.keys(this.devices).forEach(key => {
              if (!data || !data.filter || data.filter.find(item => item === key)) {
                const device = this.devices[key];
                const add = (index = null) => {
                  const item: any = {
                    id: index !== null ? `${device.id}_${index}` : device.id,
                    ident: device.ident,
                    name: device.name,
                    address: device.address,
                    mac_address: device.mac_address,
                    zone_id: device.db_device.zone_id,
                    zone_name: device.db_device.zone ? device.db_device.zone.name : '',
                    // params: device.db_device.getParams(),
                    class_name: device.class_name,
                    process_id: device.processId
                  };
                  if (data && data.current_status) {
                    item.current_status = device.current_status;
                  }
                  // if (data && data.deviceParams) {
                  //   item.deviceParams = device.getParams(index, data.target);
                  // }
                  if (data && data.formatSpeed && device.formatSpeed) {
                    item.formatSpeed = device.formatSpeed();
                  }
                  if (data && data.rangeMax && device.rangeMax) {
                    item.rangeMax = device.rangeMax;
                  }
                  if (data && data.plugin_template && device.plugin_template && !device.pluginSubDevice) {
                    item.plugin_template = device.plugin_template;
                  }
                  if (data && data.supportSetVolume) {
                    item.supportSetVolume = device.supportSetVolume;
                  }
                  result.push(item);
                }
                if (data.target && device.supportMultiDevices) {
                  device.supportMultiDevices.forEach((data, index) => {
                    add(index)
                  })
                } else {
                  add()
                }
              }
            });
            ipc.server.emit(socket, EventTypes.ApplicationGetDevices, {id: data.id, result});
          }
        },
        {
          name: EventTypes.ApplicationGetZoneDevices,
          method: (data, socket) => {
            this.controllers.zones.getDevices({
              positions: false,
              localization: 'en',
              target: data.target,
              client: {user: {is_admin: true}}
            }, {
              success: (response) => {
                ipc.server.emit(socket, EventTypes.ApplicationGetZoneDevices, {id: data.id, result: response});
              }
            });
          }
        }, {
          name: EventTypes.DatabaseUpdateDeviceParams,
          method: (data, socket) => {
            const device = this.devices[data.ident];
            if (device) {
              Object.keys(data.params).forEach(key => {
                if (key === 'address') {
                  try {
                    device.address = data.params[key];
                  } catch (e) {
                    console.error(e);
                  }
                } else {
                  device.setParam(key, data.params[key]);
                }
              });
              this.models.devices.updateParams(device.db_device);
            }
          }
        },
        {
          name: EventTypes.ApplicationAddDeviceQueue,
          method: (data, socket) => {
            const device = this.devices[data.ident];
            if (device) {
              device.queue.push(data.params);
            }
          }
        },
        {
          name: EventTypes.DatabaseReady,
          method: (data, socket) => {
            if (this.restoreBackupMode) {
              this.request('database', EventTypes.DatabaseRestore, {}).then((data: any) => {
                process.exit();
              }).catch(error => {
                console.error(error);
              });
            } else if (this.createBackupMode) {
              this.request('database', EventTypes.DatabaseBackup, {}).then((data: any) => {
                process.exit();
              }).catch(error => {
                console.error(error);
              });
            } else {
              this.publishEx(EventTypes.DatabaseReady, {id: EventTypes.DatabaseReady});
            }
          }
        },
        {
          name: EventTypes.CheckSubDevice,
          method: (data, socket) => {
            const device = this.findDeviceById(parseInt(data.device_id));
            if (device) {
              device.checkSubDevice(data.model, data.key, data.name, data.params, data.zone_id, device).then(() => {
                ipc.server.emit(socket, EventTypes.CheckSubDevice, {id: data.id, result: {}});
              }).catch((error) => {
                if (error && error.code !== 'disabled') {
                  console.error(error);
                }
                ipc.server.emit(socket, EventTypes.CheckSubDevice, {id: data.id, error});
              });
            }
          }
        },
        {
          name: EventTypes.Publish,
          method: (data, socket) => {
            this.publishEx(data.eventType, {id: data.eventType}, ...data.optionalParams);
          }
        },
        {
          name: EventTypes.Notify,
          method: (data, socket) => {
            // this.ws.sendNotify(data.message);
          }
        },
        {
          name: EventTypes.NotifyEx,
          method: (data, socket) => {
            // this.ws.sendNotifyEx(data);
          }
        },
        {
          name: EventTypes.SendNotification,
          method: (data, socket) => {
            // this.cloud.sendNotification(data);
          }
        },
        {
          name: EventTypes.Exception,
          method: (data, socket) => {
            // this.ws.sendException(data.message);
          }
        },
        {
          name: EventTypes.DevicesList,
          method: (data, socket) => {
            this.getDevicesList().then(result => {
              ipc.server.emit(socket, EventTypes.DevicesList, {id: data.id, result});
            }).catch(() => {

            })
          }
        },
        {
          name: EventTypes.ApplicationDeviceCommand,
          method: (data, socket) => {
            this.deviceCommand(data).then(result => {
              ipc.server.emit(socket, EventTypes.ApplicationDeviceCommand, {id: data.id, result});
            }).catch(error => {
              ipc.server.emit(socket, EventTypes.ApplicationDeviceCommand, {id: data.id, error});
            });
          }
        },
        {
          name: EventTypes.ApplicationGetDisplay,
          method: (data, socket) => {
            const device = this.devices[data.ident];
            if (device) {
              ipc.server.emit(socket, EventTypes.ApplicationGetDisplay, {
                id: data.id,
                result: device.getDeviceMainDisplay()
              });
            } else {
              this.log(`Device ${data.ident} not found!`);
            }
          }
        },
        {
          name: EventTypes.ApplicationDeviceRestart,
          method: (data, socket) => {
            const device = this.devices[data.ident];
            if (device) {
              device.restartServerEx();
            } else {
              this.log(`Device ${data.ident} not found!`);
            }
          }
        },
        {
          name: EventTypes.ApplicationGetConfig,
          method: (data, socket) => {
            ipc.server.emit(socket, EventTypes.ApplicationGetConfig, {id: data.id, result: this.config});
          }
        },
        {
          name: EventTypes.ApplicationUpdateConfig,
          method: (data, socket) => {
            this.config[data.ident] = data.body;
            this.updateConfig();
          }
        },
        {
          name: EventTypes.ApplicationUpdatePlugins,
          method: (data, socket) => {
            this.cloud.plugins = data.data;
          }
        },
        {
          name: EventTypes.ApplicationMemUsage,
          method: (data, socket) => {
            this.request(`driver-${data.ident}`, 'mem-usage', {}).then((result) => {
              ipc.server.emit(socket, EventTypes.ApplicationMemUsage, {id: data.id, result});
            }).catch(() => {
            });
          }
        },
        {
          name: EventTypes.ApplicationDeviceEvent,
          method: (data, socket) => {
            this.log(`application->deviceEvent ${JSON.stringify(data)}`);
            const device = this.devices[data.ident];
            if (device) {
              device.emit('new-event', data.data.value, data.event, data.data.kind, new Date(data.data.created_at), data.data.description, null, undefined, data.data.user_id);
              device.prevValue[data.event] = '';
            } else {
              this.log(`Device ${data.ident} not found!`);
            }
          }
        },
        {
          name: EventTypes.ApplicationGetTable,
          method: (data, socket) => {
            let promise;
            if (this.database[data.table]) {
              promise = this.getItems(data.table, this.queryOptions(data.options));
            } else {
              promise = this.models[data.table].findAll(this.queryOptions(data.options));
            }

            promise.then(result => {
              ipc.server.emit(socket, EventTypes.ApplicationGetTable, {id: data.id, result});
            }).catch((error) => {
              console.error(error)
              ipc.server.emit(socket, EventTypes.ApplicationGetTable, {id: data.id, error: {message: error.message}});
            });
          }
        },
        {
          name: EventTypes.ApplicationCreateTable,
          method: (data, socket) => {
            let promise;
            if (this.database[data.table]) {
              promise = this.createItem(data.table, this.queryOptions(data.options));
            }

            promise.then(result => {
              ipc.server.emit(socket, EventTypes.ApplicationCreateTable, {id: data.id, result});
            }).catch((error) => {
              console.error(error)
              ipc.server.emit(socket, EventTypes.ApplicationCreateTable, {id: data.id, error: {message: error.message}});
            });
          }
        },
        {
          name: EventTypes.ApplicationUpdateTable,
          method: (data, socket) => {
            let promise;
            if (this.database[data.table]) {
              promise = this.updateItem(data.table, this.queryOptions(data.options), this.queryOptions(data.where));
            }

            promise.then(result => {
              ipc.server.emit(socket, EventTypes.ApplicationUpdateTable, {id: data.id, result});
            }).catch((error) => {
              console.error(error)
              ipc.server.emit(socket, EventTypes.ApplicationUpdateTable, {id: data.id, error: {message: error.message}});
            });
          }
        },
        {
          name: EventTypes.ApplicationWsReceive,
          method: (data, socket) => {
            // this.ws.receive({
            //   id: data.socket_id, connected: data.socket_connected, emit: (method, data) => {
            //     ipc.server.emit(socket, EventTypes.ApplicationWsEmit, {id: data.id, method, data});
            //   }
            // }, data.method, data.data, true);
          }
        },
        {
          name: EventTypes.ApplicationSubscribeDevice,
          method: (data, socket) => {
            const device = this.devices[data.ident];
            if (device) {
              this.actions.subscribedEvents.push({
                device_id: device.id, event: data.event, update: (data1) => {
                  this.request(`driver-${data.parent_id}`, 'subscribe-device', {
                    ident: device.ident,
                    current_status: device.current_status
                  }).then(() => {
                  }).catch(error => {
                  });
                }
              });
            }
          }
        },

      ];

      events.forEach(event => {
        ipc.server.on(event.name, (data, socket) => {
          event.method(data, socket);
        });
      });

      ipc.server.on('socket.disconnected', (socket, destroyedSocketID) => {
        const index = this.ipcClients.findIndex(item => item.socket === socket);
        if (index !== -1) {
          this.ipcClients.splice(index, 1);
        }
      });

      this.subscribe(EventTypes.DatabaseConnected, () => {
        this.databaseAlreadyConnected = true;
        this.ipcClients.forEach(client => {
          ipc.server.emit(client.socket, EventTypes.DatabaseConnected);
        });
      });

      this.subscribe(EventTypes.DevicesInit, () => {
        this.ipcClients.forEach(client => {
          ipc.server.emit(client.socket, EventTypes.DevicesInit);
        });
      });
    };
    ipc.serveNet('0.0.0.0', 8000, () => {
      handle(ipc)
    });
    ipc.server.start();

    const modules = [
    ];
    const dir = this.applicationPath(__dirname, true);
    modules.forEach(filename => {
      let moduleName;
      const names = [{
        ident: filename,
        filename: `${dir}/dist/${filename}.js`,
        command: 'node',
        args: [`${dir}/dist/${filename}.js`]
      }, {
        ident: filename,
        filename: `${dir}/${filename}.js`,
        command: 'node',
        args: [`${dir}/${filename}.js`]
      }, {
        ident: filename,
        filename: `${dir}/${filename}`,
        command: `${dir}/${filename}`,
        args: []
      }];
      names.forEach(name => {
        if (!moduleName && fs.existsSync(name.filename)) {
          moduleName = name;
        }
      });
      setTimeout(() => {
        console.log(`Start command: ${moduleName.command} ${moduleName.filename}; directory: ${dir}`)
        const child = spawn(moduleName.command, moduleName.args, {cwd: dir});
        this.ipcChild.push(child);

        child.stdout.on('data', (data) => {
          this.log(removeLast(data.toString()), 'module', moduleName.ident, 'data');
        });
        child.stderr.on('data', (data) => {
          this.error(`module: ${moduleName.ident} ${removeLast(data.toString())}`);
        });
        child.on('close', (code) => {
          this.log(`${code}`, 'module', moduleName.ident, 'close');
          process.exit();
        });
      });
    });
  }

  moduleName(name) {
    return path.join(__dirname, '../..', name);
  }

  sendRequest(id, eventName, params) {
    let send = false;
    this.ipcClients.forEach(client => {
      if (client.id === id) {
        client.ipc.server.emit(client.socket, eventName, params);
        send = true;
      }
    });
    if (!send) {
      setTimeout(() => {
        this.sendRequest(id, eventName, params);
      }, 1000);
    }
  }

  addScanQueue(device, type = 'find') {
    this.sendRequest('device-scan', EventTypes.ApplicationAddScanQueue, {
      id: device.id,
      ident: device.ident,
      ip: device.ip,
      address: device.address,
      mac_address: device.mac_address,
      disableScan: device.disableScan,
      type
    });
  }

  onRequestQueue(input, callback) {
    this.requestId++;
    const id = this.requestId;
    const event = (response) => {
      if (response && response.id === id) {
        if (response['error']) {
          callback(response['error']);
        } else {
          callback(null, response['result']);
        }
        input.ipc.server.off(input.eventName, event);
      }
    };
    input.ipc.server.on(input.eventName, event);
    this.sendRequest(input.ident, input.eventName, Object.assign({id}, input.params));
  }

  request(ident, eventName, params = {}) {
    return new Promise((resolve, reject) => {
      const ipc = this.ipcClients.find(item => item.id === ident);
      if (!ipc) {
        reject({message: `Device ${ident} instance not found`, code: 'DEVICE_INSTANCE_NOT_FOUND'});
      } else {
        if (params && params['options'] && params['options']['queued']) {
          delete params['options']['queued'];
          this.requestQueue.push({ident, eventName, params, ipc: ipc.ipc}, (error, response) => {
            if (error) {
              reject(error);
            } else {
              resolve(response);
            }
          });
        } else {
          this.onRequestQueue({ident, eventName, params, ipc: ipc.ipc}, (error, response) => {
            if (error) {
              reject(error);
            } else {
              resolve(response);
            }
          });
        }
      }
    });
  }

  getDevicesList() {
    return this.request('device-scan', EventTypes.DevicesList, {});
  }

  addDevice(params) {
    return this.request('device-scan', EventTypes.DevicesAdd, params);
  }

  checkDatabaseResults(tableName, data) {
    const check = (item, tableName) => {
      const check1 = (key) => {
        if (item.dataValues && item.dataValues[key]) {
          item.dataValues[key] = new Date(item.dataValues[key]);
        }
        if (item && item[key]) {
          item[key] = new Date(item[key]);
        }
      };
      const check2 = (item, tableName) => {
        if (Array.isArray(item)) {
          check(item, tableName);
        } else {
          item.dataValues = {};
          Object.keys(item).forEach(key => {
            if (key !== 'dataValues') {
              item.dataValues[key] = item[key];
            }
          });
          check(item, tableName);
        }
      };
      if (Array.isArray(item)) {
        item.forEach(subItem => {
          check2(subItem, tableName);
        })
      } else {
        Object.keys(item).forEach(key => {
          if (key !== 'dataValues' && item[key] && typeof item[key] === 'object') {
            check2(item[key], key);
          }
        });
      }
      check1('created_at');
      check1('updated_at');
      check1('deleted_at');
      if (item.params) {
        item['getParams'] = function () {
          try {
            return JSON.parse(this['params']);
          } catch (e) {
            return null;
          }
        };
        item['getParam'] = function (name, defaultValue = null) {
          const params = this.getParams();
          return params ? (params[name] === undefined ? defaultValue : params[name]) : defaultValue;
        }
      }
      if (tableName === 'settings' || tableName === 'setting') {
        item['titleObject'] = function () {
          const title = this['title'];
          try {
            return title && title.indexOf('{') === 0 ? JSON.parse(title) : null;
          } catch (e) {
            return title;
          }
        };
        item['titleOnly'] = function () {
          const title = this.titleObject();
          return title ? title.title : this['title'];
        };
      }
    };
    if (data && data.length) {
      data.forEach(item => {
        check(item, tableName);
      });
    } else {
      check(data, tableName);
    }
  }

  databaseQuery(tableName, name, options) {
    return new Promise((resolve, reject) => {
      this.request('database', EventTypes.DatabaseQuery, {tableName, name, options}).then((data: any) => {
        this.checkDatabaseResults(tableName, data);
        resolve(data);
      }).catch(error => {
        reject(error);
      });
    });
  }

  databaseUpdate(tableName, data, options) {
    return new Promise((resolve, reject) => {
      this.request('database', EventTypes.DatabaseUpdate, {tableName, data, options}).then((data: any) => {
        resolve(data);
      }).catch(error => {
        reject(error);
      });
    });
  }

  databaseQueueQuery(tableName, name, options) {
    return new Promise((resolve, reject) => {
      this.request('database', EventTypes.DatabaseQueueQuery, {tableName, name, options}).then((data: any) => {
        this.checkDatabaseResults(tableName, data);
        resolve(data);
      }).catch(error => {
        reject(error);
      });
    });
  }

  sendNotificationCloud(body) {
    return this.request('connection', EventTypes.ApplicationSendNotification, body);
  }

  sendUpdate(body) {
    return this.request('connection', EventTypes.ApplicationUpdate, body);
  }

  sendCloudRegister() {
    return this.request('connection', EventTypes.ApplicationCloudRegister, {});
  }

  sendCloudBaseRequestEx(body) {
    return this.request('connection', EventTypes.ApplicationCloudBaseRequestEx, body);
  }

  sendSavePlugins(data) {
    return this.request('connection', EventTypes.ApplicationSavePlugins, {data});
  }

});
