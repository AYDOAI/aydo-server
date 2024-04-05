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
