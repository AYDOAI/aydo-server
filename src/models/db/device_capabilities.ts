import {BaseModel} from './base';

export class DeviceCapabilities extends BaseModel {

  constructor(app) {
    super(app, 'device_capabilities', {
      device_id: {
        type: app.Sequelize.DataTypes.INTEGER,
        allowNull: false,
      },
      ident: {
        type: app.Sequelize.DataTypes.STRING,
        allowNull: false,
      },
      index: {
        type: app.Sequelize.DataTypes.STRING,
        allowNull: false,
      },
      name: {
        type: app.Sequelize.DataTypes.STRING,
        allowNull: false,
      },
      display_name: {
        type: app.Sequelize.DataTypes.STRING,
        allowNull: false,
      },
      unit: {
        type: app.Sequelize.DataTypes.STRING,
        allowNull: true,
      },
      options: {
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
      hidden: {
        type: app.Sequelize.DataTypes.BOOLEAN,
        allowNull: false,
      },
      disabled: {
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
    this.belongsTo(models.devices.model);

    this.allItemsOpts = {
      where: {
        deleted_at: null,
      },
    };
  }

}
