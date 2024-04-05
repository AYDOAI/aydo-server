import {toMixin} from '../../../lib/foibles';
import {promiseTimeout} from '../../../lib/execute-process';
import * as BetterQueue from '../../../lib/better-queue/queue';

export const Connect = toMixin(parent => class Connect extends parent {

  connectQueue;

  constructor(app, device, options) {
    super(app, device, options);
    let subDevicesCounter = 0;
    this.connectQueue = new BetterQueue((input, callback) => {
      switch (input.type) {
        case 'connect':
          this.connectEx((result) => {
            callback(null, result)
          }, (error) => {
            callback(error);
          });
          break;
        case 'sub-devices':
          this.onGetSubDevices((error, response) => {
            if (error) {
              subDevicesCounter++;
              if (subDevicesCounter < 5) {
                this.connectQueue.push({type: 'sub-devices'});
              }
            }
            callback(error, response);
          });
          break;
      }
    }, {name: `connect-queue`});
  }

  connect() {
    return promiseTimeout(60000, () => {
      return new Promise((resolve, reject) => {
        if (this.app.config.demo) {
          if (this.class_name === 'camera.rtsp') {
            this.device = {};
          }
          if (this.getSubDevices && !this.getParam('disable_scan_sub_devices')) {
            this.app.publishEx(this.app.event_type_connected(this.class_name), {id: `${this.app.event_type_connected(this.class_name)}->${this.id}`}, this);
          }
          setInterval(() => {
            this.current_status.updated_at = new Date().getTime() / 1000;
            // this.app.publishEx(EventTypes.UpdateSensorEx, this.class_name, this.current_status, this);
          }, 5000);
          resolve({});
        } else {
          this.connectQueue.push({type: 'connect'}, (error, result) => {
            if (error) {
              reject(error);
            } else {
              if (this.getSubDevices && !this.getParam('disable_scan_sub_devices')) {
                this.getSubDevices().then(() => {
                  this.app.publishEx(this.app.event_type_connected(this.class_name), {id: `${this.app.event_type_connected(this.class_name)}->${this.id}`}, this);
                }).catch(() => {
                });
              }
              resolve(result);
            }
          });
        }
      });
    });
  }

  connectEx(resolve, reject) {
    reject();
  }

});
