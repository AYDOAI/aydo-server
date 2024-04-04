import {inspect} from 'util';

const express = require('express'),
  path = require('path'),
  router = express.Router();

function initRoutes(app) {
  router.app = app;
  app.router = router;

  router.use(function (req, res, next) {
    req.page = req.query.page ? parseInt(req.query.page) : 1;
    const msg = `${req.body && Object.keys(req.body).length > 0 ? '\n' + inspect(req.body) : ''}`;
    res.timestamp = new Date().getTime();
    res.method = req.originalUrl;
    res.method = res.method.indexOf('?') !== -1 ? res.method.substring(0, res.method.indexOf('?')) : res.method;
    if (res.method.indexOf('/') !== -1) {
      const arr = res.method.split('/');
      if (parseInt(arr[arr.length - 1]) && parseInt(arr[arr.length - 1]).toString() === arr[arr.length - 1]) {
        res.method = arr.slice(0, arr.length - 1).join('/');
      }
    }
    app.log(msg, 'api', 'request', `${req.method} ${res.method}`);

    res.error = function (error, status = 400) {
      const ip = req.headers['x-real-ip'] || req.connection.remoteAddress;
      app.log(`${error ? error.message : ''} \n ${error ? error.stack : ''}`, 'api', 'error', `${ip} ${req.method} ${res.method}`);

      if (error && typeof error === 'string') {
        this.status(status).json({errorCode: error, errorMessage: ''});
      } else if (error) {
        const newError: any = {};
        if (error.message) {
          newError.message = error.message;
        }
        if (error.stack) {
          newError.stack = error.stack;
        }
        this.status(status).json(newError);
      }
    };

    res.success = function (body, status = 200, json = true) {
      app.log('', 'api', 'response', `${req.method} ${res.method}`, new Date().getTime() - this.timestamp);

      if (json) {
        this.status(status).json(body);
      } else {
        this.status(status).send(body);
      }
    };
    let exists = true;

    if (
      !(req.method === 'GET' && res.method === '/api/v3/version') &&
      !(req.method === 'POST' && res.method === '/api/v3/users/login') &&
      !(req.method === 'POST' && res.method === '/api/v3/users')) {
      exists = false;
      const authHeader = req.headers['authorization']
      const token = authHeader && authHeader.split(' ')[1]
      if (token) {
        const jwt = require('jsonwebtoken');
        jwt.verify(token, app.config.token, (error: any, user: any) => {
          if (error) {
            app.error(error)
            return res.error(error, 403)
          } else {
            const user1 = app.database.users.items.find(item => item.login === user.login);
            if (user1) {
              req.client.user = user1;
            } else {
              return res.error({message: 'User not found.'}, 403)
            }
          }
          next()
        })
        return;
      }
    }
    if (!exists) {
      if ((req.method === 'GET' && res.method === '/')) {
        return res.status(200).send('<html>' +
          '<body>' +
          '<p>The web interface is available in the cloud version</p>' +
          '</body>' +
          '</html>');
      } else {
        return res.error({message: 'Unauthenticated'}, 401)
      }
    }

    next();
  });

  let keys = Object.keys(app.controllers);
  keys.forEach(key => {
    app.controllers[key].routes(router);
  });

  keys = Object.keys(app.devices);
  keys.forEach(key => {
    app.devices[key].routes(router);
  });

  router.get('/api/v3/version', function (req, res) {
    res.success({version: app.version, identifier: app.identifier});
  });

  router.use((req, res) => {
    app.log(`${req.originalUrl} not found`);
    res.error({message: req.originalUrl + ' not found'}, 404)
  });

  router.use(function (err, req, res, next) {
    app.log(err);
    res.error(err, 500);
  });

  return router;
}

export default {
  init: initRoutes
}
