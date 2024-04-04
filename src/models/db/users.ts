import {BaseModel} from './base';

export class Users extends BaseModel {

  constructor(app) {
    super(app, 'users', {
      name: {
        type: app.Sequelize.DataTypes.STRING,
        allowNull: false,
      },
      login: {
        type: app.Sequelize.DataTypes.STRING,
        allowNull: false,
      },
      password: {
        type: app.Sequelize.DataTypes.STRING,
        allowNull: false,
      },
      is_active: {
        type: app.Sequelize.DataTypes.BOOLEAN,
        allowNull: false,
      },
      is_admin: {
        type: app.Sequelize.DataTypes.BOOLEAN,
        allowNull: false,
      },
      created_at: {
        type: app.Sequelize.DataTypes.DATE,
      },
      updated_at: {
        type: app.Sequelize.DataTypes.DATE,
      },
    }, {
      underscored: true,
    })
  }

  associate(models) {
    this.allItemsOpts = {
      where: {
        deleted_at: null,
      },
    };
    this.validationFields = {
      name: {name: 'Name', max_length: 255},
      login: {name: 'Login', max_length: 64},
      password: {name: 'Password', min_length: 64, max_length: 64},
    };
  }

}
