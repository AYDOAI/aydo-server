import {BaseModel} from './base';

export class Stats extends BaseModel {

  constructor(app) {
    super(app, 'stats', {
      kind: {
        type: app.Sequelize.DataTypes.INTEGER,
        allowNull: false,
      },
      device_capability_id: {
        type: app.Sequelize.DataTypes.INTEGER,
        allowNull: false,
      },
      data: {
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
    this.belongsTo(models.device_capabilities.model);

    this.allItemsOpts = {
      where: {
        deleted_at: null,
      },
    };
  }

}
