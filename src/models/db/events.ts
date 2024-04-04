import {BaseModel} from './base';

export class Events extends BaseModel {

  constructor(app) {
    super(app, 'events', {
      name: {
        type: app.Sequelize.DataTypes.STRING,
        allowNull: false,
      },
      kind: {
        type: app.Sequelize.DataTypes.INTEGER,
        allowNull: false,
      },
      user_id: {
        type: app.Sequelize.DataTypes.INTEGER,
        allowNull: false,
      },
      device_id: {
        type: app.Sequelize.DataTypes.INTEGER,
        allowNull: false,
      },
      device_capability_id: {
        type: app.Sequelize.DataTypes.INTEGER,
        allowNull: false,
      },
      description: {
        type: app.Sequelize.DataTypes.STRING,
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
    this.belongsTo(models.devices.model);
    this.belongsTo(models.device_capabilities.model);

    this.allItemsOpts = {
      where: {
        deleted_at: null,
      },
    };
  }

}
