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
        const qrcode = require('qrcode');
        qrcode.toDataURL(JSON.stringify({
          login: '',
          key: '',
          server_id: '',
          server_address: ''
        }), { type: 'png' }, (err, url) => {
            if (err) {
              return res.status(200).send('An error occurred while generating QR code');
            } else {
              const html = `<style>
                  body {
                      background-color: #FBFEF4;
                  }
                  body * {
                      color: #060022;
                      font-family: "IBM Plex Mono", monospace;
                  }
                  .content {
                      width: 100vw;
                      height: 100vh;
              
                      display: flex;
                      flex-direction: column;
                      align-items: center;
                      gap: 50px;
                  }
                  .title {
                      margin: 0;
                      text-align: center;
                      font-size: 22px;
                  }
                  span {
                      font-size: 16px;
                  }
                  .copy-container {
                      display: flex;
                      flex-direction: column;
                      gap: 8px;
                  }
                  .input {
                      position: relative;
                  }
                  .copy-container input {
                      padding: 16px 60px 16px 12px;
                      width: 360px;
                      font-size: 16px;
                      border: 1px solid #060022;
                      border-radius: 8px;
                      background-color: transparent;
                      user-select: none;
                  }
                  .copy-container button {
                      position: absolute;
                      top: 50%;
                      transform: translateY(-50%);
                      right: 0;
                      padding: 16px 30px;
                      height: 100%;
                      color: white;
                      background-color: #060022;
                      border: none;
                      border-radius: 0 5px 5px 0;
                      cursor: pointer;
                  }
              </style>
              <html>
                  <head>
                      <link rel="preconnect" href="https://fonts.googleapis.com">
                      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;1,100;1,200;1,300;1,400;1,500;1,600;1,700&display=swap" rel="stylesheet">
                  </head>
                  <body>
                      <div class="content">
                          <h4 class="title">Please, scan this QR-code in the application</h4>
                          <img src="${url}" alt=""/>
                          <span>or enter this fields manually:</span>
                          <div class="copy-container">
                              <label>Hub identifier: </label>
                              <div class="input">
                                  <input type="text" value="${app.identifier}">
                                  <button onclick="copyText(app.identifier)">copy</button>
                              </div>
                          </div>
                          <div class="copy-container">
                              <label>Hub token:</label>
                              <div class="input">
                              <input type="text" value="${app.token}">
                                  <button onclick="copyText(app.token)">copy</button>
                              </div>
                          </div>
                      </div>
                      <script>
                          function copyText(text) {
                              navigator.clipboard.writeText(text);
                          }
                          </script>
                  </body>
              </html>`;
              return res.status(200).send(html);
            }
        });

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
