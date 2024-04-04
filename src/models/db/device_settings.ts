import {BaseModel} from './base';

export class DeviceSettings extends BaseModel {

  constructor(app) {
    super(app, 'device_settings', {
      device_id: {
        type: app.Sequelize.DataTypes.INTEGER,
        allowNull: false,
      },
      key: {
        type: app.Sequelize.DataTypes.STRING,
        allowNull: false,
      },
      name: {
        type: app.Sequelize.DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: app.Sequelize.DataTypes.STRING,
        allowNull: false,
      },
      type: {
        type: app.Sequelize.DataTypes.STRING,
        allowNull: false,
      },
      default_value: {
        type: app.Sequelize.DataTypes.STRING,
        allowNull: false,
      },
      params: {
        type: app.Sequelize.DataTypes.STRING,
        allowNull: false,
      },
      value: {
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

    this.allItemsOpts = {
      where: {
        deleted_at: null,
      },
    };
  }

}
