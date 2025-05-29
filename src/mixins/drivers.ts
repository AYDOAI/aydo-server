import * as fs from 'fs';
import * as path from 'path';
import {AppOptions} from '../app';
import {toMixin} from '../../lib/foibles';
import {EventTypes} from '../models/event-types';
import {Plugin} from '../drivers/plugin';
import {DbTables} from '../models/db-tables';
import {cond} from "lodash";
import {request} from "express";


export const Drivers = toMixin(base => class Drivers extends base {

  drivers = {};
  _templates = {};
  _sub_devices = {};

  load(options: AppOptions) {
    super.load(options);

    this.subscribe(EventTypes.DatabaseConnected, () => {
      this.getAllItems(DbTables.Drivers).then(items => {
        const drivers = this._drivers;
        Object.keys(drivers).forEach((key: string) => {
          try {
            const driver = new drivers[key](this, null, {template: this._templates[key], sub_device: this._sub_devices[key]});
            this.drivers[key] = driver;
            const db_driver = items.find(item => item.class_name === key);
            if (db_driver) {
              driver.db_driver = db_driver;
              if (db_driver.name !== driver.driver_name) {
                this.updateItem(DbTables.Drivers, {
                  name: driver.driver_name
                }, {
                  id: db_driver.id,
                }).then(() => {
                  this.registerDrivers();
                }).catch(() => {
                });
              }
            } else {
              driver.updateDriver();
              this.registerDrivers();
            }
          } catch (e) {
            this.error(key, e);
          }
        });
        this.publishEx(EventTypes.ApplicationDriverReady, {id: EventTypes.ApplicationDriverReady});
      }).catch(() => {
      });
    });
  }

  get _drivers() {
    const drivers = {};
    const path = require('path');

    let pluginsPath = path.join(process.cwd(), 'plugins').replace(/\\/g, '/');

    if (this.config.plugins?.path) {
      pluginsPath = path.join(this.config.plugins?.path);
    }
    console.log(pluginsPath);
    if (fs.existsSync(pluginsPath)) {

      const files = fs.readdirSync(pluginsPath);
      console.log(files);
      files.forEach(file => {
        if (path.extname(file) === '.json') {
          try {
            const template = this.loadTemplate(pluginsPath, file);
            if (template && template.class_name/* && !drivers[template.class_name]*/) {
              drivers[template.class_name] = Plugin;
              this._templates[template.class_name] = template;
              if (template.sub_devices) {
                template.sub_devices.forEach(sub_device => {
                  drivers[sub_device.class_name] = Plugin;
                  this._sub_devices[sub_device.class_name] = sub_device.class_name;
                  this._templates[sub_device.class_name] = template;
                });
              }
              console.log("succes"); }
          } catch (e) {
            this.error('getDrivers', e);
            console.log(e)
          }
        }
      });
    }

    return drivers;
  }

  // loadTemplate(path, file) {
  //   console.log(path)
  //   console.log(file)
  //   return eval(`require('${path}/${file}')`);
  // }

  // loadTemplate(templatePath: string, file: string) {
  //   const path = require("path")
  //   const fullPath = path.join(templatePath, file);
  //   console.log('🔧 Full path:', fullPath);
  //   return require(fullPath);
  // }
  loadTemplate(templatePath: string, file: string) {
    const fullPath = path.join(templatePath, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    return JSON.parse(content);
  }




});
