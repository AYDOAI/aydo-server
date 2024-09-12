import {Sequelize} from 'sequelize'
import {RequireEx} from '../lib/require-ex';
import {sequelize} from '../lib/sequelize';
import {ConfigFile} from './models/config-file';

const fs = require('fs');
const {Umzug, SequelizeStorage} = require('umzug');

const path = require('path');
const configDir = path.join(process.cwd(), 'config').replace(/\\/g, '/');
try {
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir);
  }
} catch (e) {
  console.error(e)
}

let config: ConfigFile;
const configPath = `${configDir}/config.json`;

const updateConfig = () => {
  const configStr = JSON.stringify(config, null, 2);
  fs.writeFileSync(configPath, configStr);
}

try {
  config = eval(`require('${configPath}')`);
} catch (e) {
  console.error(e);
  config = {
    port: 80,
    mdnsPort: 89,
    environment: 'production',
    production: {
      dialect: 'sqlite',
      database: 'main',
      storage: './database.sqlite',
    },
    cloud: {
      url: ''
    },
    identifier: '',
    token: '',
    log: {
      path: './logs',
    },
  };
  updateConfig();
}

const requireEx: RequireEx = new RequireEx();
let app;

const start = () => {
  requireEx.checkRequired().then(() => {
    const db = sequelize(null, config[config.environment]);
    const migrate = new Umzug({
      migrations: {
        glob: 'migrations/*.js',
        resolve: ({name, path, context}) => {
          const migration = () => import(path);
          return {
            name,
            up: async () => (await migration()).up({context}),
            down: async () => (await migration()).down({context}),
          }
        }
      },
      context: db.getQueryInterface(),
      storage: new SequelizeStorage({sequelize: db}),
      logger: console,
    });
    console.log('Running migrations');
    migrate.up().then(() => {
      console.log(`Starting application ${process.pid}`)
      const App = require('./app').App;
      app = new App();
      app.load({requireEx, config, configPath});
    }).catch(error => {
      console.error(error);
    });
  }).catch((error) => {
    console.error('Fatal error', error);
    requireEx.checkModule(error, true).then(() => {
    }).catch(() => {
    });
  });
};


process.on('unhandledRejection', (reason, promise) => {
  console.log('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.log('uncaughtException', err);
  requireEx.checkModule(err, true).then(() => {
  }).catch(() => {
  });
  if (app) {
    app.error('uncaughtException', err);
  }
});

start();

if (process.env.NODE_ENV !== 'dev') {
  const signals: any = {
    'SIGINT': 2,
    'SIGTERM': 15
  };
  Object.keys(signals).forEach((signal: any) => {
    process.on(signal, () => {
      console.log(`Process signal: ${signal}`);
      if (app) {
        app.terminate();
      }
      setTimeout(function () {
        process.exit();
      }, 1000);
    });
  });
}
