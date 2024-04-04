'use strict';

import {DbTables} from '../models/db-tables';

export class BaseController {

  app;
  table;

  constructor(app) {
    this.app = app;
  }

  routes(router) {

  }

  beforeRequest(router, method, path, func, useBody = false, checkAdmin = false, checkPermission = true, checkRole = null, checkAddRole = null) {
    router[method](path, (req, res) => {
      const run = func.bind(this);
      run(req, res)
    });
  }

  getItems(req, table: DbTables, options = null) {
    if (!options) {
      options = {};
    }
    if (!options.where) {
      options.where = {};
    }
    options.where.deleted_at = null;
    if (this.app.config.cloud && this.app.config.cloud.cloud && req && !req.client.user.is_admin) {
      options.where.user_id = req.client.user.id;
    }
    return this.app.getItems(table, options);
  }

}