import {BaseController} from './base-controller';
import {DbTables} from '../models/db-tables';

export class UserController extends BaseController {

  table = DbTables.Users;

  routes(router) {
    router.get('/api/v3/users', this.get.bind(this));
    router.post('/api/v3/users', this.post.bind(this));
    router.post('/api/v3/users/login', this.login.bind(this));
  }

  post(req, res) {
    this.app.getAllItems(DbTables.Users).then(data => {
      const user = data.find(user => user.login === req.body.login);
      if (user) {
        if (user.password === req.body.password) {
          if (!user.is_active) {
            res.success({message: 'User created. Ask hub owner to activate your account.'});
          } else {
            res.success({message: 'User already exists'});
          }
        } else {
          res.error({message: 'User already exists with different key'});
        }
      } else {
        const is_active = !!(!data || !data.length);
        this.app.createItem(DbTables.Users, {
          name: req.body.name,
          login: req.body.login,
          password: req.body.password,
          is_active: is_active,
          is_admin: is_active
        }).then(() => {
          res.success({message: is_active ? 'User created.' : 'User created. Ask hub owner to activate your account.'});
        }).catch((error) => {
          res.error(error);
        });
      }
    }).catch((error) => {
      res.error(error)
    });
  };

  login(req, res) {
    if (!req.body.login) {
      return res.error({message: 'Login is required.'});
    }
    if (!req.body.password) {
      return res.error({message: 'Password is required.'});
    }
    this.app.getAllItems(DbTables.Users).then(data => {
      const user = data.find(user => user.login === req.body.login && user.password === req.body.password);
      if (user) {
        res.success({access_token: this.app.generateAccessToken(user.login)});
      } else {
        res.error({message: 'Login or password is incorrect.'});
      }
    }).catch((error) => {
      res.error(error)
    });
  }

  get(req, res) {
    this.app.getAllItems(DbTables.Users).then(data => {
      res.success(data.map(item => {
        return {
          id: item.id,
          name: item.name,
          login: item.login,
          is_active: item.is_active,
          is_admin: item.is_admin,
          password: item.password
        }
      }));
    }).catch((error) => {
      res.error(error)
    });
  }

}
