import {BaseModel} from './base';

export class Rooms extends BaseModel {

  constructor(app) {
    super(app, 'rooms', {
      name: {
        type: app.Sequelize.DataTypes.STRING,
        allowNull: false,
      },
      zone_id: {
        type: app.Sequelize.DataTypes.INTEGER,
        allowNull: false,
      },
      user_id: {
        type: app.Sequelize.DataTypes.INTEGER,
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
    this.belongsTo(models.zones.model);
    this.belongsTo(models.users.model);

    this.allItemsOpts = {
      where: {
        deleted_at: null,
      },
    };
  }

}
