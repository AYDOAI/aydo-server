import * as Sequelize from 'sequelize';
import {AppOptions} from '../app';
import {sequelize} from '../../lib/sequelize';
import {Models} from '../models/db';
import {toMixin} from '../../lib/foibles';
import {EventTypes} from '../models/event-types';
import {DbTables} from '../models/db-tables';
import {DbTableRow} from '../models/db-table-row';

export const Database = toMixin(base => class Database extends base {

  database = {
    devices: {id: 1, items: []},
    device_capabilities: {id: 1, items: []},
    device_settings: {id: 1, items: []},
    drivers: {id: 1, items: []},
    users: {id: 1, items: []},
    zones: {id: 1, items: []},
  };

  load(options: AppOptions) {
    super.load(options);
    this.sequelize = sequelize(this, this.config[this.config.environment]);

    this.sequelize.authenticate().then(() => {
      this.log('Connection to database has been established successfully.');
      this.publish(EventTypes.DatabaseReady);
    }).catch((error) => {
      this.error(error);
    });

    this.Sequelize = Sequelize;
    this.models = new Models(this);

    Object.keys(this.models).forEach(key => {
      if (this.models[key].associate) {
        this.models[key].associate(this.models);
      }
    });

    this.subscribe(EventTypes.DatabaseReady, () => {
      this.loadDatabase().then(() => {
        this.publishEx(EventTypes.DatabaseConnected, {id: EventTypes.DatabaseConnected});
      });
    });

  }

  loadItems(key, items) {
    this.database[key].items = [];
    items.forEach(item => {
      const row = new DbTableRow(item.dataValues);
      if (item.id >= this.database[key].id) {
        this.database[key].id = item.id + 1;
      }
      this.database[key].items.push(row);
    });
  }

  loadDatabase() {
    return new Promise((resolve, reject) => {
      let counter = 0;
      let length = 0;
      let errors = 0;
      const done = (error = null) => {
        if (error) {
          this.error('Database.loadDatabase()', error);
          errors++;
        } else {
          counter++;
        }
        if (counter + errors === length) {
          if (errors) {
            reject();
          } else {
            resolve({});
          }
        }
      };
      Object.keys(this.models).forEach(key => {
        if (this.database[key]) {
          length++;
          let tableDone = false;

          const getTable = () => {
            this.models[key].getItems({queued: true}).then(items => {
              if (!tableDone) {
                tableDone = true;
                this.loadItems(key, items);
                done();
              }
            }).catch(error => {
              if (!tableDone) {
                tableDone = true;
                done(error);
              }
            });
          };

          getTable();
          const interval = setInterval(() => {
            if (tableDone) {
              clearInterval(interval);
            } else {
              getTable();
            }
          }, 20000);
        }
      });
    })
  }

  getAllItems(table: DbTables) {
    return this.getItems(table, this.models[table].allItemsOpts);
  }

  getItems(table: DbTables, options, getCopy = true): Promise<DbTableRow[]> {
    return new Promise((resolve, reject) => {
      const result = this.getItemsSync(table, options, getCopy);
      resolve(result);
    })
  }

  getItemsSync(table: DbTables, options, getCopy = true) {
    const result = [];
    this.database[table].items.forEach(item => {
      let exists = true;
      if (options && options.where) {
        Object.keys(options.where).forEach(key => {
          if (options.where[key] != item[key]) {
            exists = false;
          }
        });
      }
      if (exists) {
        const newItem = getCopy ? new DbTableRow(item) : item;
        if (options && options.include) {
          options.include.forEach(inc => {
            Object.keys(this.models[table].model.associations).forEach(key => {
              const model = this.models[table].model.associations[key];
              switch (model.associationType) {
                case 'BelongsTo':
                  if (model.associationAccessor === inc.model.options.name.singular) {
                    const where = {};
                    where[model.targetKey] = item[model.foreignKey];
                    newItem[model.as] = this.getItemsSync(inc.model.options.name.plural, {where})[0];
                  }
                  break;
                case 'HasMany':
                  if (model.target.tableName === inc.model.options.name.plural) {
                    const opts: any = {where: Object.assign({}, inc.where ? inc.where : {})};
                    opts.where[model.foreignKey] = item[model.sourceKey];
                    if (inc.attributes) {
                      opts.attributes = inc.attributes;
                    }
                    if (inc.order) {
                      opts.order = inc.order;
                    }
                    newItem[model.as] = this.getItemsSync(inc.model.options.name.plural, opts);
                  }
                  break;
                default:
                  console.log();
              }
            });
          });
        }
        if (options && options.attributes) {
          if (options.attributes.exclude && getCopy) {
            options.attributes.exclude.forEach(exc => {
              delete newItem[exc];
            });
          }
        }

        result.push(newItem);
      }
    });
    if (options && options.order) {
      result.sort((a, b) => {
        let compare = 0;
        options.order.forEach(order => {
          if (!compare && order && order.length) {
            if (typeof a[order[0]] === 'string' && typeof b[order[0]] === 'string') {
              const an = a[order[0]] ? a[order[0]] : '';
              const bn = b[order[0]] ? b[order[0]] : '';
              compare = an.localeCompare(bn);
            } else {
              const an = a[order[0]] ? a[order[0]] : 0;
              const bn = b[order[0]] ? b[order[0]] : 0;
              if (an > bn) {
                compare = 1;
              } else if (an < bn) {
                compare = -1;
              }
            }
          }
        });
        return compare;
      });
    }
    if (options && options.afterSort) {
      options.afterSort(result);
    }
    return result;
  }

  getOrCreateItem(table: DbTables, where, defaults): Promise<DbTableRow> {
    return new Promise((resolve, reject) => {
      this.getItem(table, where).then((item) => {
        resolve(item);
      }).catch(() => {
        this.createItem(table, Object.assign(where, defaults)).then((item) => {
          resolve(item);
        }).catch((error) => {
          reject(error);
        })
      });
    });
  };

  getItem(table: DbTables, where, getNull = false, getCopy = true): Promise<DbTableRow> {
    return this.getItemEx(table, {where}, getNull, getCopy);
  }

  getItemEx(table: DbTables, options, getNull = false, getCopy = true): Promise<DbTableRow> {
    return new Promise((resolve, reject) => {
      this.getItems(table, options, getCopy).then((items) => {
        if (items[0] || getNull) {
          resolve(items[0]);
        } else {
          reject({message: `${table}: Item not found`});
        }
      }).catch((error) => {
        reject(error);
      });
    });
  }

  createItem(table: DbTables, options): Promise<DbTableRow> {
    return new Promise((resolve, reject) => {
      const row = new DbTableRow(options);
      if (!row.id) {
        row.id = this.database[table].id;
        this.database[table].id++;
      }
      this.models[table].validate(row).then(() => {
        this.models[table].create(row).then(item => {
          this.updateFields(row, item.dataValues);
          this.database[table].items.push(row);
          resolve(row);
        }).catch(error => {
          reject(error);
        });
      }).catch(error => {
        reject(error);
      })
    });
  }

  deleteItem(table: DbTables, where: object): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.models[table].destroy({ where }).then(deletedCount => {
        if (deletedCount === 0) {
          return reject({message: 'Item not found'});
        }
        this.database[table].items = this.database[table].items.filter(item => {
          return !Object.keys(where).every(key => item[key] === where[key]);
        });
        resolve(true);
      }).catch(error => {
        reject(error);
      });
    });
  }


  updateFields(row, fields) {
    Object.keys(fields).forEach(itemKey => {
      row[itemKey] = fields[itemKey];
    });
  }

  updateItem(table: DbTables, options, where) {
    return new Promise((resolve, reject) => {
      this.getItem(table, where, false, false).then(row => {
        this.updateFields(row, options);
        this.models[table].updateItem(options, where).then(() => {
        }).catch(error => {
          this.error('Database.updateItem()', error);
        });
        resolve(row);
      }).catch((error) => {
        reject(error);
      });
    });
  }

});

/*
[
  DbTableRow {
    created_at: 2024-12-10T14:52:33.682Z,
    updated_at: 2024-12-10T14:52:33.696Z,
    id: 2,
    device_id: 2,
    unique: true,
    key: 'mqtt_address',
    name: 'MQTT Address',
    description: '',
    type: 'text',
    default_value: '',
    params: '{}',
    value: '127.0.0.1',
    deviceId: 2
  },
  DbTableRow {
    created_at: 2024-12-11T16:02:17.918Z,
    updated_at: 2024-12-11T16:02:17.925Z,
    id: 3,
    device_id: 3,
    unique: true,
    key: 'mqtt_address',
    name: 'MQTT Address',
    description: '',
    type: 'text',
    default_value: '',
    params: '{}',
    value: '127.0.0.1',
    deviceId: 3
  },
  DbTableRow {
    created_at: 2024-12-11T16:02:30.003Z,
    updated_at: 2024-12-11T16:02:30.004Z,
    id: 4,
    device_id: 4,
    unique: true,
    key: 'mqtt_address',
    name: 'MQTT Address',
    description: '',
    type: 'text',
    default_value: '',
    params: '{}',
    value: '127.0.0.2',
    deviceId: 4
  },
  DbTableRow {
    created_at: 2024-12-11T16:15:53.540Z,
    updated_at: 2024-12-11T16:15:53.549Z,
    id: 5,
    device_id: 5,
    unique: true,
    key: 'mqtt_address',
    name: 'MQTT Address',
    description: '',
    type: 'text',
    default_value: '',
    params: '{}',
    value: '127.0.0.1',
    deviceId: 5
  },
  DbTableRow {
    created_at: 2024-12-11T16:15:58.104Z,
    updated_at: 2024-12-11T16:15:58.109Z,
    id: 6,
    device_id: 6,
    unique: true,
    key: 'mqtt_address',
    name: 'MQTT Address',
    description: '',
    type: 'text',
    default_value: '',
    params: '{}',
    value: '127.0.0.2',
    deviceId: 6
  },
  DbTableRow {
    created_at: 2024-12-11T16:16:00.811Z,
    updated_at: 2024-12-11T16:16:00.825Z,
    id: 7,
    device_id: 7,
    unique: true,
    key: 'mqtt_address',
    name: 'MQTT Address',
    description: '',
    type: 'text',
    default_value: '',
    params: '{}',
    value: '127.0.0.5',
    deviceId: 7
  },
  DbTableRow {
    created_at: 2024-12-11T16:19:23.073Z,
    updated_at: 2024-12-11T16:19:23.083Z,
    id: 8,
    device_id: 8,
    unique: true,
    key: 'mqtt_address',
    name: 'MQTT Address',
    description: '',
    type: 'text',
    default_value: '',
    params: '{}',
    value: '127.0.0.7',
    deviceId: 8
  },
  DbTableRow {
    created_at: 2024-12-11T16:27:45.888Z,
    updated_at: 2024-12-11T16:27:45.890Z,
    id: 9,
    device_id: 9,
    unique: true,
    key: 'mqtt_address',
    name: 'MQTT Address',
    description: '',
    type: 'text',
    default_value: '',
    params: '{}',
    value: '127.0.0.10',
    deviceId: 9
  },
  DbTableRow {
    created_at: 2024-12-11T16:32:13.044Z,
    updated_at: 2024-12-11T16:32:13.048Z,
    id: 10,
    device_id: 10,
    unique: true,
    key: 'mqtt_address',
    name: 'MQTT Address',
    description: '',
    type: 'text',
    default_value: '',
    params: '{}',
    value: '127.0.0.102',
    deviceId: 10
  },
  DbTableRow {
    created_at: 2024-12-11T16:42:22.940Z,
    updated_at: 2024-12-11T16:42:22.950Z,
    id: 14,
    device_id: 14,
    unique: true,
    key: 'mqtt_address',
    name: 'MQTT Address',
    description: '',
    type: 'text',
    default_value: '',
    params: '{}',
    value: '127.0.0.155',
    deviceId: 14
  },
  DbTableRow {
    created_at: 2024-12-11T16:50:17.172Z,
    updated_at: 2024-12-11T16:50:17.175Z,
    id: 17,
    device_id: 17,
    unique: true,
    key: 'mqtt_address',
    name: 'MQTT Address',
    description: '',
    type: 'text',
    default_value: '',
    params: '{}',
    value: '127.0.0.145',
    deviceId: 17
  },
  DbTableRow {
    created_at: 2024-12-11T17:38:59.318Z,
    updated_at: 2024-12-11T17:38:59.323Z,
    id: 18,
    device_id: 18,
    unique: true,
    key: 'mqtt_address',
    name: 'MQTT Address',
    description: '',
    type: 'text',
    default_value: '',
    params: '{}',
    value: '127.0.0.12222',
    deviceId: 18
  },
  DbTableRow {
    created_at: 2024-12-11T17:41:15.096Z,
    updated_at: 2024-12-11T17:41:15.110Z,
    id: 19,
    device_id: 19,
    unique: true,
    key: 'mqtt_address',
    name: 'MQTT Address',
    description: '',
    type: 'text',
    default_value: '',
    params: '{}',
    value: '127.0.0.1323',
    deviceId: 19
  }
]
posle
[
  DbTableRow {
    created_at: 2024-12-10T14:52:33.682Z,
    updated_at: 2024-12-10T14:52:33.696Z,
    id: 2,
    device_id: 2,
    unique: true,
    key: 'mqtt_address',
    name: 'MQTT Address',
    description: '',
    type: 'text',
    default_value: '',
    params: '{}',
    value: '127.0.0.1',
    deviceId: 2
  },
  DbTableRow {
    created_at: 2024-12-11T16:02:17.918Z,
    updated_at: 2024-12-11T16:02:17.925Z,
    id: 3,
    device_id: 3,
    unique: true,
    key: 'mqtt_address',
    name: 'MQTT Address',
    description: '',
    type: 'text',
    default_value: '',
    params: '{}',
    value: '127.0.0.1',
    deviceId: 3
  },
  DbTableRow {
    created_at: 2024-12-11T16:02:30.003Z,
    updated_at: 2024-12-11T16:02:30.004Z,
    id: 4,
    device_id: 4,
    unique: true,
    key: 'mqtt_address',
    name: 'MQTT Address',
    description: '',
    type: 'text',
    default_value: '',
    params: '{}',
    value: '127.0.0.2',
    deviceId: 4
  },
  DbTableRow {
    created_at: 2024-12-11T16:15:53.540Z,
    updated_at: 2024-12-11T16:15:53.549Z,
    id: 5,
    device_id: 5,
    unique: true,
    key: 'mqtt_address',
    name: 'MQTT Address',
    description: '',
    type: 'text',
    default_value: '',
    params: '{}',
    value: '127.0.0.1',
    deviceId: 5
  },
  DbTableRow {
    created_at: 2024-12-11T16:15:58.104Z,
    updated_at: 2024-12-11T16:15:58.109Z,
    id: 6,
    device_id: 6,
    unique: true,
    key: 'mqtt_address',
    name: 'MQTT Address',
    description: '',
    type: 'text',
    default_value: '',
    params: '{}',
    value: '127.0.0.2',
    deviceId: 6
  },
  DbTableRow {
    created_at: 2024-12-11T16:16:00.811Z,
    updated_at: 2024-12-11T16:16:00.825Z,
    id: 7,
    device_id: 7,
    unique: true,
    key: 'mqtt_address',
    name: 'MQTT Address',
    description: '',
    type: 'text',
    default_value: '',
    params: '{}',
    value: '127.0.0.5',
    deviceId: 7
  },
  DbTableRow {
    created_at: 2024-12-11T16:19:23.073Z,
    updated_at: 2024-12-11T16:19:23.083Z,
    id: 8,
    device_id: 8,
    unique: true,
    key: 'mqtt_address',
    name: 'MQTT Address',
    description: '',
    type: 'text',
    default_value: '',
    params: '{}',
    value: '127.0.0.7',
    deviceId: 8
  },
  DbTableRow {
    created_at: 2024-12-11T16:27:45.888Z,
    updated_at: 2024-12-11T16:27:45.890Z,
    id: 9,
    device_id: 9,
    unique: true,
    key: 'mqtt_address',
    name: 'MQTT Address',
    description: '',
    type: 'text',
    default_value: '',
    params: '{}',
    value: '127.0.0.10',
    deviceId: 9
  },
  DbTableRow {
    created_at: 2024-12-11T16:32:13.044Z,
    updated_at: 2024-12-11T16:32:13.048Z,
    id: 10,
    device_id: 10,
    unique: true,
    key: 'mqtt_address',
    name: 'MQTT Address',
    description: '',
    type: 'text',
    default_value: '',
    params: '{}',
    value: '127.0.0.102',
    deviceId: 10
  },
  DbTableRow {
    created_at: 2024-12-11T16:42:22.940Z,
    updated_at: 2024-12-11T16:42:22.950Z,
    id: 14,
    device_id: 14,
    unique: true,
    key: 'mqtt_address',
    name: 'MQTT Address',
    description: '',
    type: 'text',
    default_value: '',
    params: '{}',
    value: '127.0.0.155',
    deviceId: 14
  },
  DbTableRow {
    created_at: 2024-12-11T16:50:17.172Z,
    updated_at: 2024-12-11T16:50:17.175Z,
    id: 17,
    device_id: 17,
    unique: true,
    key: 'mqtt_address',
    name: 'MQTT Address',
    description: '',
    type: 'text',
    default_value: '',
    params: '{}',
    value: '127.0.0.145',
    deviceId: 17
  },
  DbTableRow {
    created_at: 2024-12-11T17:38:59.318Z,
    updated_at: 2024-12-11T17:38:59.323Z,
    id: 18,
    device_id: 18,
    unique: true,
    key: 'mqtt_address',
    name: 'MQTT Address',
    description: '',
    type: 'text',
    default_value: '',
    params: '{}',
    value: '127.0.0.12222',
    deviceId: 18
  },
  DbTableRow {
    created_at: 2024-12-11T17:41:15.096Z,
    updated_at: 2024-12-11T17:41:15.110Z,
    id: 19,
    device_id: 19,
    unique: true,
    key: 'mqtt_address',
    name: 'MQTT Address',
    description: '',
    type: 'text',
    default_value: '',
    params: '{}',
    value: '127.0.0.1323',
    deviceId: 19
  },
  DbTableRow {
    created_at: 2024-12-11T17:44:26.710Z,
    updated_at: 2024-12-11T17:44:26.716Z,
    device_id: 20,
    key: 'mqtt_address',
    name: 'MQTT Address',
    type: 'text',
    defaultValue: '127.0.0.1',
    unique: true,
    value: '127.0.0.1551',
    description: '',
    default_value: '',
    params: '{}',
    id: 20,
    deviceId: 20
  }
]

 */

/*
dooo
[
  DbTableRow {
    created_at: 2024-12-10T14:52:33.673Z,
    updated_at: 2024-12-10T14:52:33.674Z,
    id: 2,
    ident: 'test_1733842353647',
    identifier: null,
    name: 'TEST1234',
    driver_id: 1,
    zone_id: null,
    user_id: null,
    parent_id: null,
    disabled: false,
    deleted_at: null,
    driverId: 1,
    zoneId: null,
    userId: null
  },
  DbTableRow {
    created_at: 2024-12-11T16:02:17.903Z,
    updated_at: 2024-12-11T16:02:17.906Z,
    id: 3,
    ident: 'test_1733932937893',
    identifier: null,
    name: 'TEST1234',
    driver_id: 1,
    zone_id: null,
    user_id: null,
    parent_id: null,
    disabled: false,
    deleted_at: null,
    driverId: 1,
    zoneId: null,
    userId: null
  },
  DbTableRow {
    created_at: 2024-12-11T16:02:29.993Z,
    updated_at: 2024-12-11T16:02:29.995Z,
    id: 4,
    ident: 'test_1733932949984',
    identifier: null,
    name: 'TEST1234',
    driver_id: 1,
    zone_id: null,
    user_id: null,
    parent_id: null,
    disabled: false,
    deleted_at: null,
    driverId: 1,
    zoneId: null,
    userId: null
  },
  DbTableRow {
    created_at: 2024-12-11T16:15:53.518Z,
    updated_at: 2024-12-11T16:15:53.528Z,
    id: 5,
    ident: 'test_1733933753493',
    identifier: null,
    name: 'TEST1234',
    driver_id: 1,
    zone_id: null,
    user_id: null,
    parent_id: null,
    disabled: false,
    deleted_at: null,
    driverId: 1,
    zoneId: null,
    userId: null
  },
  DbTableRow {
    created_at: 2024-12-11T16:15:58.092Z,
    updated_at: 2024-12-11T16:15:58.096Z,
    id: 6,
    ident: 'test_1733933758082',
    identifier: null,
    name: 'TEST1234',
    driver_id: 1,
    zone_id: null,
    user_id: null,
    parent_id: null,
    disabled: false,
    deleted_at: null,
    driverId: 1,
    zoneId: null,
    userId: null
  },
  DbTableRow {
    created_at: 2024-12-11T16:16:00.801Z,
    updated_at: 2024-12-11T16:16:00.803Z,
    id: 7,
    ident: 'test_1733933760792',
    identifier: null,
    name: 'TEST1234',
    driver_id: 1,
    zone_id: null,
    user_id: null,
    parent_id: null,
    disabled: false,
    deleted_at: null,
    driverId: 1,
    zoneId: null,
    userId: null
  },
  DbTableRow {
    created_at: 2024-12-11T16:19:23.057Z,
    updated_at: 2024-12-11T16:19:23.062Z,
    id: 8,
    ident: 'test_1733933963026',
    identifier: null,
    name: 'TEST1234',
    driver_id: 1,
    zone_id: null,
    user_id: null,
    parent_id: null,
    disabled: false,
    deleted_at: null,
    driverId: 1,
    zoneId: null,
    userId: null
  },
  DbTableRow {
    created_at: 2024-12-11T16:27:45.863Z,
    updated_at: 2024-12-11T16:27:45.873Z,
    id: 9,
    ident: 'test_1733934465852',
    identifier: null,
    name: 'TEST1234',
    driver_id: 1,
    zone_id: null,
    user_id: null,
    parent_id: null,
    disabled: false,
    deleted_at: null,
    driverId: 1,
    zoneId: null,
    userId: null
  },
  DbTableRow {
    created_at: 2024-12-11T16:32:13.023Z,
    updated_at: 2024-12-11T16:32:13.031Z,
    id: 10,
    ident: 'test_1733934733012',
    identifier: null,
    name: 'TEST1234',
    driver_id: 1,
    zone_id: null,
    user_id: null,
    parent_id: null,
    disabled: false,
    deleted_at: null,
    driverId: 1,
    zoneId: null,
    userId: null
  },
  DbTableRow {
    created_at: 2024-12-11T16:42:22.926Z,
    updated_at: 2024-12-11T16:42:22.929Z,
    id: 14,
    ident: 'test_1733935342915',
    identifier: null,
    name: 'TEST1234',
    driver_id: 1,
    zone_id: null,
    user_id: null,
    parent_id: null,
    disabled: false,
    deleted_at: null,
    driverId: 1,
    zoneId: null,
    userId: null
  },
  DbTableRow {
    created_at: 2024-12-11T16:50:17.156Z,
    updated_at: 2024-12-11T16:50:17.160Z,
    id: 17,
    ident: 'test_1733935817102',
    identifier: null,
    name: 'TEST1234',
    driver_id: 1,
    zone_id: null,
    user_id: null,
    parent_id: null,
    disabled: false,
    deleted_at: null,
    driverId: 1,
    zoneId: null,
    userId: null
  },
  DbTableRow {
    created_at: 2024-12-11T17:38:59.301Z,
    updated_at: 2024-12-11T17:38:59.308Z,
    id: 18,
    ident: 'test_1733938739290',
    identifier: null,
    name: 'TEST1234',
    driver_id: 1,
    zone_id: null,
    user_id: null,
    parent_id: null,
    disabled: false,
    deleted_at: null,
    driverId: 1,
    zoneId: null,
    userId: null
  },
  DbTableRow {
    created_at: 2024-12-11T17:41:15.072Z,
    updated_at: 2024-12-11T17:41:15.078Z,
    id: 19,
    ident: 'test_1733938875061',
    identifier: null,
    name: 'TEST1234',
    driver_id: 1,
    zone_id: null,
    user_id: null,
    parent_id: null,
    disabled: false,
    deleted_at: null,
    driverId: 1,
    zoneId: null,
    userId: null
  },
  DbTableRow {
    created_at: 2024-12-11T17:44:26.673Z,
    updated_at: 2024-12-11T17:44:26.686Z,
    id: 20,
    ident: 'test_1733939066661',
    identifier: null,
    name: 'TEST1234',
    driver_id: 1,
    zone_id: null,
    user_id: null,
    parent_id: null,
    disabled: false,
    deleted_at: null,
    driverId: 1,
    zoneId: null,
    userId: null
  }
]
pooosle
[
  DbTableRow {
    created_at: 2024-12-10T14:52:33.673Z,
    updated_at: 2024-12-10T14:52:33.674Z,
    id: 2,
    ident: 'test_1733842353647',
    identifier: null,
    name: 'TEST1234',
    driver_id: 1,
    zone_id: null,
    user_id: null,
    parent_id: null,
    disabled: false,
    deleted_at: null,
    driverId: 1,
    zoneId: null,
    userId: null
  },
  DbTableRow {
    created_at: 2024-12-11T16:02:29.993Z,
    updated_at: 2024-12-11T16:02:29.995Z,
    id: 4,
    ident: 'test_1733932949984',
    identifier: null,
    name: 'TEST1234',
    driver_id: 1,
    zone_id: null,
    user_id: null,
    parent_id: null,
    disabled: false,
    deleted_at: null,
    driverId: 1,
    zoneId: null,
    userId: null
  },
  DbTableRow {
    created_at: 2024-12-11T16:15:53.518Z,
    updated_at: 2024-12-11T16:15:53.528Z,
    id: 5,
    ident: 'test_1733933753493',
    identifier: null,
    name: 'TEST1234',
    driver_id: 1,
    zone_id: null,
    user_id: null,
    parent_id: null,
    disabled: false,
    deleted_at: null,
    driverId: 1,
    zoneId: null,
    userId: null
  },
  DbTableRow {
    created_at: 2024-12-11T16:15:58.092Z,
    updated_at: 2024-12-11T16:15:58.096Z,
    id: 6,
    ident: 'test_1733933758082',
    identifier: null,
    name: 'TEST1234',
    driver_id: 1,
    zone_id: null,
    user_id: null,
    parent_id: null,
    disabled: false,
    deleted_at: null,
    driverId: 1,
    zoneId: null,
    userId: null
  },
  DbTableRow {
    created_at: 2024-12-11T16:16:00.801Z,
    updated_at: 2024-12-11T16:16:00.803Z,
    id: 7,
    ident: 'test_1733933760792',
    identifier: null,
    name: 'TEST1234',
    driver_id: 1,
    zone_id: null,
    user_id: null,
    parent_id: null,
    disabled: false,
    deleted_at: null,
    driverId: 1,
    zoneId: null,
    userId: null
  },
  DbTableRow {
    created_at: 2024-12-11T16:19:23.057Z,
    updated_at: 2024-12-11T16:19:23.062Z,
    id: 8,
    ident: 'test_1733933963026',
    identifier: null,
    name: 'TEST1234',
    driver_id: 1,
    zone_id: null,
    user_id: null,
    parent_id: null,
    disabled: false,
    deleted_at: null,
    driverId: 1,
    zoneId: null,
    userId: null
  },
  DbTableRow {
    created_at: 2024-12-11T16:27:45.863Z,
    updated_at: 2024-12-11T16:27:45.873Z,
    id: 9,
    ident: 'test_1733934465852',
    identifier: null,
    name: 'TEST1234',
    driver_id: 1,
    zone_id: null,
    user_id: null,
    parent_id: null,
    disabled: false,
    deleted_at: null,
    driverId: 1,
    zoneId: null,
    userId: null
  },
  DbTableRow {
    created_at: 2024-12-11T16:32:13.023Z,
    updated_at: 2024-12-11T16:32:13.031Z,
    id: 10,
    ident: 'test_1733934733012',
    identifier: null,
    name: 'TEST1234',
    driver_id: 1,
    zone_id: null,
    user_id: null,
    parent_id: null,
    disabled: false,
    deleted_at: null,
    driverId: 1,
    zoneId: null,
    userId: null
  },
  DbTableRow {
    created_at: 2024-12-11T16:42:22.926Z,
    updated_at: 2024-12-11T16:42:22.929Z,
    id: 14,
    ident: 'test_1733935342915',
    identifier: null,
    name: 'TEST1234',
    driver_id: 1,
    zone_id: null,
    user_id: null,
    parent_id: null,
    disabled: false,
    deleted_at: null,
    driverId: 1,
    zoneId: null,
    userId: null
  },
  DbTableRow {
    created_at: 2024-12-11T16:50:17.156Z,
    updated_at: 2024-12-11T16:50:17.160Z,
    id: 17,
    ident: 'test_1733935817102',
    identifier: null,
    name: 'TEST1234',
    driver_id: 1,
    zone_id: null,
    user_id: null,
    parent_id: null,
    disabled: false,
    deleted_at: null,
    driverId: 1,
    zoneId: null,
    userId: null
  },
  DbTableRow {
    created_at: 2024-12-11T17:38:59.301Z,
    updated_at: 2024-12-11T17:38:59.308Z,
    id: 18,
    ident: 'test_1733938739290',
    identifier: null,
    name: 'TEST1234',
    driver_id: 1,
    zone_id: null,
    user_id: null,
    parent_id: null,
    disabled: false,
    deleted_at: null,
    driverId: 1,
    zoneId: null,
    userId: null
  },
  DbTableRow {
    created_at: 2024-12-11T17:41:15.072Z,
    updated_at: 2024-12-11T17:41:15.078Z,
    id: 19,
    ident: 'test_1733938875061',
    identifier: null,
    name: 'TEST1234',
    driver_id: 1,
    zone_id: null,
    user_id: null,
    parent_id: null,
    disabled: false,
    deleted_at: null,
    driverId: 1,
    zoneId: null,
    userId: null
  },
  DbTableRow {
    created_at: 2024-12-11T17:44:26.673Z,
    updated_at: 2024-12-11T17:44:26.686Z,
    id: 20,
    ident: 'test_1733939066661',
    identifier: null,
    name: 'TEST1234',
    driver_id: 1,
    zone_id: null,
    user_id: null,
    parent_id: null,
    disabled: false,
    deleted_at: null,
    driverId: 1,
    zoneId: null,
    userId: null
  }
]

 */
