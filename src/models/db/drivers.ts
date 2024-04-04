import {BaseModel} from './base';

export class Drivers extends BaseModel {
  constructor(app) {
    super(app, 'drivers', {
      name: {
        type: app.Sequelize.DataTypes.STRING,
        allowNull: false
      },
      description: {
        type: app.Sequelize.DataTypes.STRING,
        allowNull: true
      },
      class_name: {
        type: app.Sequelize.DataTypes.STRING,
        allowNull: false
      },
    }, {
      underscored: true,
    });
  }
}
