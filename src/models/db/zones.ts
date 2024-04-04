import {BaseModel} from './base';

export class Zones extends BaseModel {

  constructor(app) {
    super(app, 'zones', {
      name: {
        type: app.Sequelize.DataTypes.STRING,
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
    this.belongsTo(models.users.model);

    this.allItemsOpts = {
      where: {
        deleted_at: null,
      },
    };
  }

}
