import {DbTables} from '../models/db-tables';
import {BaseDriver} from './base-driver';
import {Connect2} from './mixins/connect2';
import {Dynamic} from './mixins/dynamic';

export class Plugin extends BaseDriver.with(Connect2, Dynamic) {

  connect_sub_devices_after_parent = true;

  get class_name() {
    return this.plugin_sub_device ? this.plugin_sub_device : this.plugin_template.class_name;
  }

  get parent_class_name() {
    return this.plugin_sub_device ? this.plugin_template.class_name : null;
  }

  get plugin_sub_device_template() {
    return this.plugin_sub_device ? this.plugin_template.sub_devices.find(item => item.class_name === this.plugin_sub_device) : null;
  }

  get driver_name() {
    return this.plugin_sub_device ? this.plugin_sub_device_template.name : this.plugin_template.name;
  }

  get description() {
    return this.plugin_sub_device ? this.plugin_sub_device_template.description : this.plugin_template.description;
  }

  get real_plugin_template() {
    return this.plugin_sub_device ? this.plugin_sub_device_template : this.plugin_template;
  }

  get status_event_name() {
    return this.app.event_type_status(this.plugin_sub_device ? this.parent_class_name : this.class_name,
      this.plugin_sub_device && this.identifier ? this.identifier : `driver-${this.id}`);
  }

  get identifier() {
    return this.db_device.identifier;
  }

  get driver_module_name() {
    return this.plugin_template.module;
  }

  get parent() {
    return this.plugin_sub_device ? this.getParent() : null;
  }

  get support_auto_update() {
    return (this.plugin_sub_device ? this.plugin_sub_device_template.support_autoupdate : this.plugin_template.support_autoupdate);
  }

  validateParams(params) {
    return true;
  }

  error(...message) {
    this.app.error(...arguments)
  }

  updateDriver() {
    this.app.getOrCreateItem(DbTables.Drivers, {
      class_name: this.class_name,
    }, {
      name: this.driver_name,
      description: this.description,
    }).then((driver) => {
      this.db_driver = driver;
    }).catch(error => {
      this.error(error);
    });
  }

  onInit() {
    if (this.db_device) {
      const device_functions = this.real_plugin_template.device_functions;
      if (device_functions) {
        device_functions.forEach(func => {
          this.addDeviceFunction(func.code, func.name, func.params, func.is_status);
        });
        this.updateDeviceFunctions();
      }
      this.app.subscribe(this.app.event_type_connected(this.class_name), () => {
        if (!this.plugin_sub_device) {
          if (this.plugin_template.connect_config_new) {
            this.deviceCommand({command: 'settings_new'}).then((response: any) => {
              if (response) {
                response.forEach(item => {
                  this.app.settingsNew[item.class_name] = item;
                });
              }
            }).catch(() => {
            });
          }
          if (this.plugin_template.connect_config) {
            this.deviceCommand({command: 'settings'}).then(response => {
              if (response) {
                Object.keys(response).forEach(key => {
                  this.setParam(key, response[key]);
                });
              }
              this.saveDeviceParams();
            }).catch(() => {
            });
          }
        }
      });
      if (this.pluginSubDevice) {
        this.app.subscribe(this.app.event_type_connected(this.parent_class_name), () => {
          this.app.addConnectQueue('connectEx', this, true);
        });
      }
      this.statusSubscribe();
    }
  }

  statusSubscribe() {
    this.lastStatusEventName = this.status_event_name;
    this.app.log(`subscribe ${this.status_event_name}`);
    this.app.subscribe(this.status_event_name, (status) => {
      // if (status && status.parent_identifier && status.parent_identifier !== this.getParam('parent_id')) {
      //   console.log(`Skip status update ${this.getParam('parent_id')} ${status.parent_identifier}`);
      //   return;
      // }
      const time = new Date().getTime();
      if (!this.lastStatusUpdateTime) {
        this.lastStatusUpdateTime = time;
      }
      this.log(`${time - this.lastStatusUpdateTime} ${JSON.stringify(status)}`);
      this.lastStatusUpdateTime = time;

      if (status.custom_settings) {
        // this.custom_settings = status.custom_settings;
      }
      if (status.preview || status.preview_url) {
        // if (status.preview) {
        //   this.preview_data = {channel: this.getParam('channel')}
        //   this.savePreview(status.preview)
        // }
        // this.preview_url = status.preview_url;
        // this.sendVideo(null, this.preview, null, this.preview_url, false, false, true);
      } else if (status.system) {
        // switch (status.command) {
        //   case 'get-sub-devices':
        //     this.deviceCommand({command: status.command}).then(() => {
        //     }).catch(() => {
        //     });
        //     break;
        // }
      } else {
        this.emit('update_updated_at_now');
        Object.keys(status).forEach(key => {
          //   if (status[key] === null) {
          //     status[key] = 0;
          //   }
          if (['capabilities', 'settings', 'update_settings', 'parent_identifier', 'displays'].indexOf(key) === -1) {
            this.current_status[key] = status[key];
            if (this.app.mqtt) {
              try {
                const identifier = this.identifier ? this.identifier : this.ident;
                const message = typeof status[key] === 'object' ? JSON.stringify(status[key]) : status[key];
                const cap = this.capabilities.find(item => key === `${item.ident}${item.index ? `_${item.index}` : ''}`);
                if (cap || key === 'connected') {
                  this.app.mqtt.publish(`aydo/${identifier}/${cap ? `${cap.ident}/${cap.index}` : key}`, `${message}`);
                }
              } catch (e) {
                this.error(e);
              }
            }
          } else if (this.current_status[key]) {
            delete this.current_status[key]
          }
          //   if (this.power_active_stats && key.indexOf('power') === 0) {
          //     const cap = this.param_capabilities ? this.param_capabilities.find(item => key === this.getCapabilityIdent(item)) : null;
          //     if (cap && cap.ident === 'power') {
          //       this.updateActiveStats(key, this.invert_power ? !status[key] : status[key]);
          //     }
          //   }
          //   this.emit(`update_${key}`, status[key]);
          //   if (this.invert_power && key.indexOf('power') === 0) {
          //     const cap = this.param_capabilities ? this.param_capabilities.find(item => key === this.getCapabilityIdent(item)) : null;
          //     if (cap && cap.ident === 'power') {
          //       status[key] = !status[key];
          //       this.current_status[key] = status[key];
          //     }
          //   }
          //   if (this.invert_range && key.indexOf('range') === 0) {
          //     const cap = this.param_capabilities ? this.param_capabilities.find(item => key === this.getCapabilityIdent(item)) : null;
          //     if (cap && cap.ident === 'range') {
          //       status[key] = (this.rangeMax - (status[key] - this.rangeMin));
          //       this.current_status[key] = status[key];
          //     }
          //   }
            if (key === 'capabilities') {
              this.updateCapabilities(status[key]);
          //     this.setParam(key, status[key]);
          //     this.saveDeviceParams();
          //   } else if (key === 'update_settings') {
          //     Object.keys(status.settings).forEach(key => {
          //       this.setParam(key, status.settings[key]);
          //     });
          //     this.saveDeviceParams();
          //   } else if (key === 'settings_ex') {
          //     this.setParam(key, status[key]);
          //     this.saveDeviceParams();
          //   } else if (key === 'displays') {
          //     this.setParam(key, status[key]);
          //     this.saveDeviceParams();
          //   } else if (key === 'connected') {
          //     this.app.drivers.emit('device-connect', this, status[key]);
          //   } else if (key.indexOf('counter') === 0 && this.getParam('support_power_usage_by_counter')) {
          //     this.updateCounter(`counter${this.getPostfix(key)}`, `power_usage${this.getPostfix(key)}`, `power_load${this.getPostfix(key)}`, this.current_status, status[key]);
          //   } else if (key.indexOf('counter') === 0 && this.getParam('support_water_usage_by_counter')) {
          //     this.updateWaterCounter(`counter${this.getPostfix(key)}`, `water_usage${this.getPostfix(key)}`, this.current_status, status[key]);
          //   } else if (key.indexOf('motion_') === 0 && key.indexOf('motion_value') === -1 && (this.supportMotion || this.supportMotionEx)) {
          //     this.emit(`update_motion`, status[key], true, undefined, status['images']);
          //   } else if (key.indexOf('magnet_') === 0 && (this.supportMagnet || this.supportMagnetEx)) {
          //     this.emit(`update_magnet`, status[key]);
          //   } else if (key.indexOf('action_') === 0 && (this.supportAction || this.supportActionEx)) {
          //     this.emit(`update_action`, status[key]);
          //   } else if (key.indexOf('leak_') === 0 && (this.supportLeak || this.supportLeakEx)) {
          //     this.emit(`update_leak`, status[key]);
          //   } else if (key.indexOf('smoke_') === 0 && (this.supportSmoke || this.supportSmokeEx)) {
          //     this.emit(`update_smoke`, status[key]);
          //   } else if (key.indexOf('tamper_') === 0 && (this.supportTamper || this.supportTamperEx)) {
          //     this.emit(`update_tamper`, status[key]);
            }
        })
        // this.queueUpdateEx();
      }
    });
  }

  // getIcon() {
  //   return this.getParam('icon', this.icon);
  // }

}