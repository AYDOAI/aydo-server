import {BaseController} from './base-controller';
import {DbTables} from '../models/db-tables';
import {EventTypes} from '../models/event-types';

export class DeviceController extends BaseController {

  table = DbTables.Devices;

  routes(router) {
    router.get('/api/v3/devices', this.get.bind(this));
    this.beforeRequest(router, 'post', '/api/v3/devices', this.post, false, true, false, null, 'add_devices');
    this.beforeRequest(router, 'post', '/api/v3/devices/settings/:id', this.postSettings, false, true, false, null, 'add_devices');
  }

  devices(req, created = null) {
    const result = {devices: [], created};
    return new Promise((resolve, reject) => {
      this.getItems(req, DbTables.Devices).then(data => {
        data.forEach(row => {
          result.devices.push({
            id: row.id,
            name: row.name,
            driver_id: row.driver_id,
            zone_id: row.zone_id,
            parent_id: row.parent_id,
            disabled: row.disabled
          });
        });
        resolve(result);
      }).catch((error) => {
        reject(error);
      });
    })
  }

  getDevices(req, res, created = null) {
    this.devices(req, created).then(result => {
      res.success(result);
    }).catch(error => {
      res.error(error);
    })
  }

  get(req, res, created = null) {
    const result = {
      devices: [],
      created,
    };

    this.devices(req, created).then((data: any) => {
      result.devices = data.devices;
      result.created = data.created;
      res.success(result);
    }).catch((error) => {
      res.error(error)
    });
  };

  post(req, res) {
    this.app.newDevice(req.client.user.id, req.body).then((data) => {
      this.getDevices(req, res, data);
    }).catch(error => {
      res.error(error);
    });
  };

  postSettings(req, res) {
    const device = this.app.findDeviceById(parseInt(req.params.id));
    if (device) {
      req.body.device_id = device.id;
      const where = {device_id: req.body.device_id, key: req.body.key};
      this.app.getItem(DbTables.DeviceSettings, where, true).then(data => {
        if (data) {
          Object.keys(req.body).forEach(key => {
            data[key] = req.body[key];
          });
          this.app.updateItem(DbTables.DeviceSettings, data, {id: data.id}).then((data) => {
            res.success({id: data.id});
          }).catch(error => {
            res.error(error);
          })
        } else {
          this.app.createItem(DbTables.DeviceSettings, req.body).then((data) => {
            res.success({id: data.id});
          }).catch(error => {
            res.error(error);
          })
        }
      }).catch(error => {
        res.error(error);
      });
    } else {
      res.error({message: 'Device not found.'});
    }
  }

}
