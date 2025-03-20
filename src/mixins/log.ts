import * as moment from 'moment';
import * as winston from 'winston';
import * as BetterQueue from '../../lib/better-queue/queue';
import * as _ from 'lodash';
import {inspect} from 'util';
import {AppOptions} from '../app';
import {toMixin} from '../../lib/foibles';
const path = require('path');
const fs = require('fs');
import {executeProcess} from '../../lib/execute-process';

const validLogs = {
  network: {
    request: {
      get: true,
      post: true,
      'any-method': true
    },
    'any-group': {
      'any-method': true
    }
  },
  database: {
    query: {
      execute: true,
      'any-method': true
    }
  }
};

export const Log = toMixin(base => class Log extends base {

  loggers: Record<string, winston.Logger> = {};
  logQueue: BetterQueue;
  useProcessInfo: boolean;
  currentProcessTime: number;
  lastProcessTime: number;
  lastMemoryUsage: {
    rss: number,
    heapTotal: number,
    heapUsed: number,
    external: number,
    arrayBuffers: number
  };
  lastMemoryUsageTime: number;
  logBuffer: { message: string; id: number; error: boolean }[] = [];
  logSendInterval: any;

  constructor() {
    super();

    this.useProcessInfo = false;
    this.logQueue = new BetterQueue(this.onLogQueue.bind(this), {name: 'app-logs'});
  }

  load(options: AppOptions) {
    super.load(options);
    this.create('info');
    this.create('action');
    this.loggers['error'] = this.loggers['info'];
    if (this.useProcessInfo) {
      const p = path.join(process.cwd(), 'process.sh');
      if (fs.existsSync(p)) {
        setInterval(() => {
          executeProcess(p, [process.pid]).then(data => {
            let time = data ? data.split('\n')[0] : null;
            if (time) {
              time = time.match(/(\d+)([mh]?)(?:\s+(\d+)m)?/gm);
              if (time && time.length === 3) {
                time = parseInt(time[0]) * 60 * 1000 + parseInt(time[1]) * 1000 + parseInt(time[2]);
                // if (this.lastProcessTime) {
                //   this.currentProcessTime = time - this.lastProcessTime;
                // }
                // this.lastProcessTime = time;
                this.currentProcessTime = time;
              }
            }
          }).catch((error) => {
            console.log(error);
          });
        }, 500);
      } else {
        setTimeout(() => {
          this.log(`${p} not exists`);
        });
      }
    }
    if (!this.logSendInterval) {
      this.logSendInterval = setInterval(() => this.sendLogs(), 10 * 60 * 1000);
    }
  }

  log(message, mainGroup = null, group = null, method = null, time = null, method1 = null, module = 'info') {
    this.pushLog({type: 'info', message, mainGroup, group, method, time, method1, module});
  }

  logEx(message, mainGroup = null, group = null, method = null, onLog, time = null, method1 = null, ps = false, datetime = true, memusage = true) {
    if (mainGroup || group || method || method1) {
      const v1 = validLogs[mainGroup];
      const v2 = v1 ? v1[group] : null;
      const v3 = v2 ? v2[method] : null;
      if (v1 === undefined || (v2 === undefined && group && v1['any-group'] === undefined) || (v3 === undefined && method && v2['any-method'] === undefined)) {
        this.log(`${mainGroup} ${group} ${method} ${message}`);
      }

      if (this.config.log && this.config.log[mainGroup]) {
        if (this.config.log[mainGroup].last_access) {
          // delete this.config.log[mainGroup];
          // this.updateConfig();
        }
      }

      let update = false;
      let config;
      const check = (param, parent = null, defValue = null) => {
        if (!param) {
          return;
        }
        if (!parent) {
          parent = config;
        }
        config = parent[param];
        if (config === undefined || config === true || config === false || config === 'empty') {
          const value = config ? config : (param === 'error' ? true : (defValue === 'empty' ? defValue : (defValue && parent.value === undefined ? !!defValue : (parent.value !== undefined ? parent.value : false))));
          config = {value};
          update = true;
        }
      };
      check('log', this.config);
      check(mainGroup);
      check(group);
      check(method, null, v3 !== undefined ? v3 : v2['any-method']);
      check(method1);

      if ((config === false || (config && config.value === false)) && (!time || time < 1000)) {
        return;
      }
      if (typeof message === 'object') {
        message = inspect(message);
      }
      if (config === false || (config && config.value === false)) {
        if (time) {
          // message = `${message && message.length < 50 ? message : ''} (${time} ms)`
          message = `${message ? message : ''} (${time} ms)`
        }
      } else if (time) {
        message += ` (${time} ms)`
      }
      if (config && config.value === 'empty') {
        if (time) {
          message = `(${time} ms)`
        } else {
          message = '';
        }
      } else if (config && typeof config.value === 'string') {
        const regex = new RegExp(config.value);
        if (!message.match(regex)) {
          return;
        }
      }
      if (method) {
        message = `${method}: ${message}`
      }
      if (group) {
        message = `${group}: ${message}`
      }
      if (mainGroup) {
        message = `${mainGroup}: ${message}`
      }

    } else if (time) {
      if (typeof message === 'object') {
        message = inspect(message);
      }
      message += ` (${time} ms)`
    } else {
      if (typeof message === 'object') {
        message = inspect(message);
      }
    }
    if (ps) {
      onLog(`${this.datetime()} ${this.currentProcessTime && this.lastProcessTime ? this.currentProcessTime - this.lastProcessTime + ' ' : ''}${message}`);
      this.lastProcessTime = this.currentProcessTime;
    } else {
      onLog(`${datetime ? this.datetime() + ' ' : ''}${memusage ? this.memoryUsage() + ' ': ''}${message}`);
    }
  }

  pushLog(data) {
    if (this.config && this.config.log && !this.config.log.queue) {
      this.onLogQueue(data, null);
    } else {
      if (this.logQueue) {
        this.logQueue.push(data);
      } else {
        console.log(data);
      }
    }
  }

  error(message) {
    this.errorModule('info', message);
  }

  errorEx(message, error) {
    this.errorModule('info', message, error);
  }

  errorModule(module, message, error = null) {
    if (typeof message === 'object') {
      message = inspect(message);
    }
    this.pushLog({type: 'error', module, message: `${this.datetime()} ${message}`, error});
  }

  datetime() {
    return moment(new Date()).format('DD-MM-YYYY HH:mm:ss');
  }

  memoryUsage() {
    const time = new Date().getTime();
    if (!this.lastMemoryUsage || time - this.lastMemoryUsageTime >= 1000) {
      this.lastMemoryUsage = process.memoryUsage();
      this.lastMemoryUsageTime = time;
    }
    const formatMem = (ident) => {
      return `${ident}: ${Math.round(this.lastMemoryUsage[ident] / 1024 / 1024 * 100) / 100}MB`;
    };

    return `${formatMem('rss')};`;
  }

  create(name: string): void {
    const logPath = `${this.config.log.path}/${name}.log`;
    if (!this.loggers[name]) this.loggers[name] = winston.createLogger({
      transports: [new winston.transports.File({
        format: winston.format.simple(),
        filename: logPath,
        maxsize: 10 * 1024 * 1024,
        maxFiles: 5
      }),
        new winston.transports.Console({
          format: winston.format.combine(
              winston.format.colorize(),
              winston.format.printf(({ level, message }) => `${level}: ${message}`)
          )
        })]
    });
  }

  onLogQueue(input: any, callback: any) {
    if (!this.loggers[input.module]) {
      this.create(input.module);
    }

    const logger = this.loggers[input.module];
    const finalize = () => callback?.(null, null);

    switch (input.type) {
      case 'info':
      case 'action':
        this.logEx(input.message, input.mainGroup, input.group, input.method, (message) => {
          this.loggerInfo(logger, message);
          if (input.type === 'info') {
            finalize();
          }
        }, input.time, input.method1, this.useProcessInfo, input.module === 'info', input.module === 'info');
        if (input.type === 'action') {
          finalize();
        }
        break;
      case 'error':
        this.loggerError(logger, input.message, input.error);
        finalize();
        break;
    }
  }

  loggerInfo(logger: winston.Logger, message: string) {
    if (!logger) {
      console.info(message);
      return;
    }

    logger.info(message);
    this.addLog(message);
  }

  loggerError(logger: winston.Logger, message: string, err: any) {
    if (!logger) {
      console.error(message, err);
      return;
    }

    let logMessage = message;
    if (err) {
      const errorData = _.isError(err)
          ? { errorCode: (err as NodeJS.ErrnoException).code, errorMessage: err.message, stack: err.stack }
          : err;
      logger.error(logMessage, errorData);
      logMessage += ' ' + JSON.stringify(errorData, null, 2);
    } else {
      logger.error(logMessage);
    }

    this.addLog(logMessage, true);
  }

  addLog(message: string, error = false) {
      const logObj = { message, id: Date.now(), error };
      this.logBuffer.push(logObj);
  }

  private sendLogs() {
    if (!this.ws) return;
    if (this.ws && this.logBuffer.length > 0) {
      this.ws.emit('logs', this.logBuffer);
      this.logBuffer = [];
    }
  }
});
