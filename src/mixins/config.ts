import * as fs from 'fs';
import * as os from 'os';
import {ConfigFile} from '../models/config-file';
import {AppOptions} from '../app';
import {toMixin} from '../../lib/foibles';

export const Config = toMixin(base => class ConfigClass extends base {
  config: ConfigFile;
  configPath: string;
  configDate;
  identifier;
  token;

  load(options: AppOptions) {
    super.load(options);
    this.config = options.config;
    this.configPath = options.configPath;
    if (fs.existsSync(this.configPath)) {
      fs.watchFile(this.configPath, () => {
        if (!this.configDate || this.configDate !== this.getConfigDate()) {
          try {
            delete require.cache[require.resolve(this.configPath)];
          } catch (e) {
          }
          this.log('Reload config');
          this.reloadConfig();
        }
      });
    } else {
      this.log(`${this.configPath} not exists`);
    }

    this.identifier = this.config.identifier;
    if (!this.identifier) {
      this.identifier = this.getMac();
      this.config.identifier = this.identifier;
      this.updateConfig();
    }
    this.token = this.config.token;
    if (!this.token) {
      this.token = require('crypto').randomBytes(64).toString('hex');
      this.config.token = this.token;
      this.updateConfig();
    }
  }

  reloadConfig() {
    this.config = eval(`require('${this.configPath}')`);
    this.configDate = this.getConfigDate();
  }

  updateConfig() {
    const config = JSON.stringify(this.config, null, 2);
    fs.writeFileSync(this.configPath, config);
    this.configDate = this.getConfigDate();
  }

  getConfigDate() {
    const stats = fs.statSync(this.configPath);
    return stats.mtime;
  }

  getMac(): string {
    const interfaces = os.networkInterfaces();
    for (let key in interfaces) {
      const addresses = interfaces[key];
      for (let i = addresses.length; i--;) {
        const address = addresses[i];
        if (address.family === 'IPv4' && !address.internal) {
          const mac = address.mac.split(':').reverse().splice(0, 3).join('').toUpperCase();
          return `aydo-${mac}`;
        }
      }
    }
  }

  generateAccessToken(login) {
    const jwt = require('jsonwebtoken');
    return jwt.sign({login}, this.config.token, {expiresIn: '7 days'});
  }

});
