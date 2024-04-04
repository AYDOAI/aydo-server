import * as BetterQueue from '../../../lib/better-queue/queue';
import {ModelAttributes, ModelOptions} from 'sequelize';

export class BaseModel {

  app;
  model;
  name: string;
  allItemsOpts: any;
  validationFields = {};
  writeQueue;
  mergedTasks = 0;
  updateStates = {};

  constructor(app, modelName: string, attributes: ModelAttributes, options: ModelOptions) {
    this.app = app;
    this.allItemsOpts = {};
    this.name = modelName;
    options['createdAt'] = 'created_at';
    options['updatedAt'] = 'updated_at';
    this.model = this.app.sequelize.define(modelName, attributes, options);

    this.writeQueue = new BetterQueue(this.onWrite.bind(this), {
      merge: (oldTask, newTask, cb) => {
        this.mergedTasks++;
        cb(null, newTask);
      },
      name: 'database-write'
    });

  }

  belongsTo(target, options = {}) {
    this.model.belongsTo(target, options);
  }

  hasMany(target, options = {}) {
    this.model.hasMany(target, options);
  }

  associate(models) {

  }

  options(options) {
    const include = (options) => {
      if (options.include) {
        options.include.forEach(incl => {
          incl.model = incl.model.tableName;
          include(incl);
        });
      }
      if (options.where) {
        Object.keys(options.where).forEach(key => {
          if (options.where[key] && typeof options.where[key] === 'object' && !Array.isArray(options.where[key])) {
            const check = (key1, key2) => {
              if (options.where[key][key1]) {
                options.where[key][key2] = options.where[key][key1];
                delete options.where[key][key1];
              }
            };
            check(this.app.Sequelize.Op.gt, '>');
            check(this.app.Sequelize.Op.lt, '<');
            check(this.app.Sequelize.Op.gte, '>=');
            check(this.app.Sequelize.Op.lte, '<=');
            check(this.app.Sequelize.Op.like, 'LIKE');
          }
        });
      }
    };
    include(options);
  }

  query(name, options) {
    const ms = new Date().getTime();
    const check = () => {
      const diff = new Date().getTime() - ms;
      if (diff > 500) {
        this.app.log(`${this.name}.${name} (${diff} ms) ${JSON.stringify(options)}`);
      }
    };
    return new Promise((resolve, reject) => {
      const func = this.model[name].bind(this.model);
      func(options).then(data => {
        check();
        resolve(data);
      }).catch(error => {
        this.app.error(error);
        reject(error);
      });
    });
  }

  queueQuery(name, options) {
    return new Promise((resolve, reject) => {
      this.writeQueue.push({name, options}, (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      });
    });
  }

  findAll(options) {
    return this.query('findAll', options);
  }

  findOne(options) {
    return this.query('findOne', options);
  }

  findAndCountAll(options) {
    return this.query('findAndCountAll', options);
  }

  create(options) {
    return this.queueQuery('create', options);
  }

  validate(options) {
    return new Promise((resolve, reject) => {
      let error = null;
      const keys = Object.keys(this.validationFields);
      keys.forEach(key => {
        if (!error) {
          const field = this.validationFields[key];
          const value = options[key];
          if (!value) {
            error = {message: `'${field.name}' field is not defined!`}
          } else if (field.min_length && value.length < field.min_length) {
            error = {message: `'${field.name}' field minimum length: ${field.min_length}!`}
          } else if (field.max_length && value.length > field.max_length) {
            error = {message: `'${field.name}' field maximum length: ${field.max_length}!`}
          }
        }
      });
      if (error) {
        reject(error);
      } else {
        resolve({});
      }
    });
  }

  findOrCreate(options) {
    return this.queueQuery('findOrCreate', options);
  }

  update(data, options) {
    return new Promise((resolve, reject) => {

      let id = null;
      if (options && options.where) {
        Object.keys(options.where).forEach(key => {
          if (key === 'id') {
            id = options.where.id;
          } else {
            return id = null;
          }
        });
      }
      const queueOptions: any = {kind: 'update', data, options};
      const push = () => {
        this.writeQueue.push(queueOptions, (error, result) => {
          if (error) {
            reject(error);
          } else {
            if (id) {
              this.updateStates[id] = {last_update: new Date().getTime()};
            }
            resolve(result);
          }
        });
      };
      if (id) {
        queueOptions.id = id;
      }
      const timeout = 60000;
      const time = id && this.updateStates[id] && ['stats', 'device_functions', 'settings'].indexOf(this.name) !== -1 ?
        new Date().getTime() - this.updateStates[id].last_update : timeout;
      if (time < timeout) {
        setTimeout(() => {
          push();
        }, timeout - time);
      } else {
        push();
      }
    });
  }

  destroy(options) {
    return this.queueQuery('destroy', options);
  }

  getAllItems() {
    return new Promise((resolve, reject) => {
      this.findAll(this.allItemsOpts).then(data => {
        resolve(data);
      }).catch(error => {
        reject(error);
      });
    });
  };

  getItems(options) {
    return new Promise((resolve, reject) => {
      this.findAll(options).then(data => {
        resolve(data);
      }).catch(error => {
        reject(error);
      });
    });
  };

  getItem(options, getNull = false) {
    return new Promise((resolve, reject) => {
      this.findOne({
        where: options
      }).then(data => {
        if (data || getNull) {
          resolve(data);
        } else {
          reject(null);
        }
      }).catch(error => {
        reject(error);
      });
    });
  };

  getItemEx(options, getNull = false) {
    return new Promise((resolve, reject) => {
      this.findOne(options).then(data => {
        if (data || getNull) {
          resolve(data);
        } else {
          reject({message: `Row not found`, options: options.where});
        }
      }).catch(error => {
        reject(error);
      });
    });
  };

  createItem(defaults) {
    return new Promise((resolve, reject) => {
      this.create(defaults).then(data => {
        if (data) {
          resolve(data);
        } else {
          reject(null);
        }
      }).catch(error => {
        reject(error);
      });
    });
  };

  getOrCreateItem(where, defaults) {
    return new Promise((resolve, reject) => {
      this.findOrCreate({
        where: where,
        defaults: defaults,
      }).then((data: any) => {
        if (data && data.length > 0) {
          resolve(data[0]);
        } else {
          reject(null);
        }
      }).catch(error => {
        reject(error);
      });
    });
  };

  updateItem(options, where) {
    return new Promise((resolve, reject) => {
      this.update(options, {
        where: where
      }).then(data => {
        resolve(data);
      }).catch(error => {
        this.app.error(error);
        reject(error);
      });
    });
  }

  updateItemEx(data, options) {
    return new Promise((resolve, reject) => {
      this.update(data, options).then(data => {
        resolve(data);
      }).catch(error => {
        this.app.error(error);
        reject(error);
      });
    });
  }

  deleteItem(options) {
    return new Promise((resolve, reject) => {
      this.destroy({
        where: options
      }).then(data => {
        resolve(data);
      }).catch(error => {
        reject(error);
      });
    });
  };

  onWrite(task, callback) {
    switch (task.kind) {
      case 'update':
        this.model.update(task.data, task.options).then(data => {
          callback(null, data);
        }).catch(error => {
          console.error(error);
          callback(error, null);
        });
        break;
      default:
        this.query(task.name, task.options).then(data => {
          callback(null, data);
        }).catch(error => {
          callback(error, null);
        });
    }
  }

}
