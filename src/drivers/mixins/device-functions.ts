import {toMixin} from '../../../lib/foibles';

export const DeviceFunctions = toMixin(parent => class DeviceFunctions extends parent {

  updateDeviceFunctions() {
    return new Promise((resolve, reject) => {
      return resolve({});
    });
  }

});
