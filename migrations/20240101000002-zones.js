const {Sequelize} = require('sequelize');

async function up({context: queryInterface}) {
  await queryInterface.createTable('zones', {
    "id": {
      "type": Sequelize.INTEGER,
      "allowNull": false,
      "primaryKey": true,
      "autoIncrement": true
    },
    "name": {
      "type": Sequelize.STRING,
      "allowNull": false
    },
    "user_id": {
      "type": Sequelize.INTEGER,
      "allowNull": true,
      "references": {
        "model": {
          "tableName": "users",
          // "schema": "schema"
        },
        "key": "id"
      },
    },
    "location": {
      "type": Sequelize.STRING,
      "allowNull": true
    },
    "is_indoor": {
      "type": Sequelize.BOOLEAN,
      "allowNull": false
    },
    "created_at": {
      "type": Sequelize.DATE,
      "allowNull": false
    },
    "updated_at": {
      "type": Sequelize.DATE,
      "allowNull": false
    },
    "deleted_at": {
      "type": Sequelize.DATE,
      "allowNull": true
    }
  });
}

async function down({context: queryInterface}) {
  await queryInterface.dropTable('zones');
}

module.exports = {up, down};
