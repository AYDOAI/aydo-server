import {BaseModel} from './base';

export class Devices extends BaseModel {

  constructor(app) {
    super(app, 'devices', {
      name: {
        type: app.Sequelize.DataTypes.STRING,
        allowNull: false,
      },
      driver_id: {
        type: app.Sequelize.DataTypes.INTEGER,
        allowNull: false,
      },
      zone_id: {
        type: app.Sequelize.DataTypes.INTEGER,
        allowNull: true,
      },
      user_id: {
        type: app.Sequelize.DataTypes.INTEGER,
        allowNull: true,
      },
      parent_id: {
        type: app.Sequelize.DataTypes.INTEGER,
        allowNull: true,
      },
      disabled: {
        type: app.Sequelize.DataTypes.BOOLEAN,
        allowNull: true,
      },
      deleted_at: {
        type: app.Sequelize.DataTypes.DATE,
        allowNull: true,
      },
    }, {
      underscored: true,
    });
  }

  associate(models) {
    this.belongsTo(models.drivers.model);
    this.belongsTo(models.zones.model);
    this.belongsTo(models.users.model);
    this.hasMany(models.device_capabilities.model);
    this.hasMany(models.device_settings.model);

    this.allItemsOpts = {
      where: {
        deleted_at: null,
      },
      order: [
        ['zone_id'],
        ['name']
      ],
      include: [
        {
          model: models.drivers.model,
        },
          {
            model: models.zones.model,
          },
          {
            model: models.users.model,
          },
        //   {
        //     model: models.device_capabilities.model,
        //     where: {
        //       deleted_at: null
        //     },
        //     required: false,
        //   },
        //   {
        //     model: models.device_settings.model,
        //     where: {
        //       deleted_at: null
        //     },
        //     required: false,
        //   },
      ]
    };
    this.validationFields = {
      name: {name: 'Name', max_length: 255},
    };
  };

}
