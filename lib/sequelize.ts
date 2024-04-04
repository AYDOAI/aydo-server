const {Sequelize} = require('sequelize');

export function sequelize(app, config) {
  if (config.dialect === 'sqlite') {
    return new Sequelize(config.database, config.username, config.password, {
      dialect: config.dialect,
      storage: config.storage,
      // logging: this.config.log.db,
      define: {
        instanceMethods: {
          getApp: () => {
            return app;
          }
        }
      },
      retry: {
        match: [
          /SQLITE_BUSY/,
        ],
        name: 'query',
        max: 25
      },
      pool: {
        maxactive: 1,
        max: 1,
        min: 0,
        idle: 20000
      },
      transactionType: 'IMMEDIATE'
    });
  } else {
    let dbConnectionString = `${config.dialect}://`;
    if (config.username) {
      dbConnectionString += `${config.username}:${config.password}@`
    }
    dbConnectionString += `${config.host}/${config.database}`;

    return new Sequelize(dbConnectionString, {
      dialect: config.dialect,
      timezone: config.timezone,
      // logging: this.config.log.db,
      define: {
        instanceMethods: {
          getApp: () => {
            return app;
          }
        }
      }
    });
  }
}