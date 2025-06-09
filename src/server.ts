import {Sequelize} from 'sequelize'
import {RequireEx} from '../lib/require-ex';
import {sequelize} from '../lib/sequelize';
import {ConfigFile} from './models/config-file';

const fs = require('fs');
const os = require('os');
const {Umzug, SequelizeStorage} = require('umzug');
const child_process = require('child_process');

const path = require('path');

const configDir = path.join(os.homedir(), '.aydo', 'server').replace(/\\/g, '/');
try {
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, {recursive: true});
  }
} catch (e) {
  console.error(e)
}

const pluginsDir = path.join(os.homedir(), '.aydo', 'server', 'plugins').replace(/\\/g, '/');
try {
  if (!fs.existsSync(pluginsDir)) {
    fs.mkdirSync(pluginsDir, {recursive: true});
  }
} catch (e) {
  console.error(e)
}

const logsDir = path.join(os.homedir(), '.aydo', 'server', 'logs').replace(/\\/g, '/');
try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, {recursive: true});
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
  const resolvedPath = path.resolve(configPath);
  if (fs.existsSync(resolvedPath)) {
    delete require.cache[require.resolve(resolvedPath)];
    config = require(resolvedPath);
  } else {
    throw new Error('Configuration file not found.');
  }
} catch (e) {
  console.log('Configuration file not found. Creating a default configuration file.');
  config = {
    port: 80,
    mdnsPort: 89,
    environment: 'production',
    production: {
      dialect: 'sqlite',
      database: 'main',
      storage: `${configDir}/database.sqlite`,
    },
    cloud: {
      url: ''
    },
    identifier: '',
    token: '',
    log: {
      path: `${logsDir}`,
    },
    capability: {
      threshold: 10000
    },
    core: {
      autoUpdate: false,
      updateOnStart: true,
      backupBeforeUpdate: false
    },
    plugins: {
      path: `${pluginsDir}`,
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
        resolve: ({name, path: migrationPath, context}) => {
          console.log('Running migration: ', name, path);
          const migration = require(require('path').resolve(migrationPath));
          return {
            name,
            up: async () => migration.up({context}),
            down: async () => migration.down({context}),
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

process.on('exit', (code) => {
  console.log(`Process exit with code: ${code}`);

  if (code === 100) {
    setTimeout(() => {
      const child = child_process.spawn(process.argv[0], process.argv.slice(1), {
        detached: true,
        stdio: 'inherit'
      });
      child.unref();
    }, 1000);
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
