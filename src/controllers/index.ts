import {DeviceController} from './device-controller';
import {UserController} from './user-controller';

export class Controllers {

  device;
  user;

  constructor(app) {
    this.device = new DeviceController(app);
    this.user = new UserController(app);
  }

  request(controllerName, methodName, params = null, body = null) {
    return new Promise((resolve, reject) => {
      const method = this[controllerName][methodName].bind(this[controllerName]);
      method({params, body}, {
        success: (data) => {
          resolve(data);
        },
        error: (error) => {
          reject(error);
        }
      });
    });
  }

}
