import {toMixin} from '../../../lib/foibles';
import {ConnectionStates} from '../../models/connection-states';

export const Connect2 = toMixin(parent => class Connect2 extends parent {

  constructor(app, device, options) {
    super(app, device, options);
    this.on('device-params-changed', () => {
      this.deviceParamsChanged().then(() => {

      });
    });
  }

  get initMethod() {
    return 'onInitEx';
  }

  get initDeviceMethod() {
    return 'initDevice';
  }

  get connectMethod() {
    return 'connectEx';
  }

  get address() {
    return this.getParam('address');
  }

  set address(value) {
    this.db_device.setParam('address', value);
    this.emit('device-params-changed');
  }

  initDevice() {
    return new Promise((resolve, reject) => {
      this.initDeviceEx(() => {
        this.setInitialized(ConnectionStates.DeviceInitialized).then(() => {
        });
        if (this.connectSubDevicesAfterParent && this.getParam('parent_id') && this.parent_class_name && !this.app.ready) {
        } else {
          this.app.addConnectQueue('connectEx', this, true);
        }
        resolve({});
      }, (error) => {
        reject(error);
      });
    });
  }

  initDeviceEx(resolve, reject) {
    resolve({});
  }

  deviceParamsChanged() {
    return new Promise((resolve, reject) => {
      this.deviceParamsChangedEx(resolve, reject);
    });
  }

  deviceParamsChangedEx(resolve, reject) {
    resolve({});
  }

});
