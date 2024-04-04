import * as fs from 'fs';
import * as express from 'express';
import * as http from 'http';
import * as https from 'https';
import * as bodyParser from 'body-parser';
import * as cors from 'cors';
import {AppOptions} from '../app';
import {toMixin} from '../../lib/foibles';
import {EventTypes} from '../models/event-types';
import routes from '../routes/routes';

export const RestApi = toMixin(base => class RestApi extends base {

  load(options: AppOptions) {
    super.load(options);
    this.express = express();
    this.http = http.createServer(this.express);

    if (this.config.https_port) {
      const privateKey = fs.readFileSync(this.config.key, 'utf8');
      const certificate = fs.readFileSync(this.config.certificate, 'utf8');
      const credentials = {key: privateKey, cert: certificate};
      this.https = https.createServer(credentials, this.express);
    }

    this.express.use(bodyParser.urlencoded({extended: true}));
    this.express.use(bodyParser.json());

    this.express.use(function setCommonHeaders(req, res, next) {
      res.set('Access-Control-Allow-Private-Network', true);
      next();
    });

    this.express.use(cors());
    this.express.options('*', cors());

    const ports = [80, 8080, 8000, 8888];
    let portIndex = 0;
    const listen = (port) => {
      this.http.listen(this.config.port ? this.config.port : port, () => {
        port = this.http.address().port;
        if (this.config.port !== port) {
          this.config.port = port;
          this.updateConfig();
        }
        this.log(`HTTP Server ${this.version} started at port ${this.config.port}`);
      });
    };

    this.http.on('error', (error) => {
      this.error(`HTTP Server ${this.version} at port ${this.config.port}`, error);
      if (error && error.code === 'EADDRINUSE' && !this.config.port) {
        portIndex++;
        if (ports[portIndex]) {
          listen(ports[portIndex]);
        }
      }
    });
    listen(ports[portIndex]);

    if (this.config.https_port) {
      this.https.listen(this.config.https_port, () => {
        this.log(`HTTPS Server ${this.version} started at port ${this.config.https_port}`);
      });
      this.https.on('error', (error) => {
        this.error(`HTTPS Server ${this.version} at port ${this.config.https_port}`, error);
      });
    }

    this.subscribe(EventTypes.DevicesInit, () => {
      this.express.use('/', routes.init(this));
    });

  }

});
