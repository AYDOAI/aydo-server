const {Sequelize} = require('sequelize');

async function up({context: queryInterface}) {
  await queryInterface.createTable('device_settings', {
    "id": {
      "type": Sequelize.INTEGER,
      "allowNull": false,
      "primaryKey": true,
      "autoIncrement": true
    },
    "device_id": {
      "type": Sequelize.INTEGER,
      "allowNull": false,
      "references": {
        "model": {
          "tableName": "devices",
          // "schema": "schema"
        },
        "key": "id"
      },
    },
    "key": {
      "type": Sequelize.STRING,
      "allowNull": false
    },
    "name": {
      "type": Sequelize.STRING,
      "allowNull": false
    },
    "description": {
      "type": Sequelize.STRING,
      "allowNull": true
    },
    "type": {
      "type": Sequelize.STRING,
      "allowNull": false
    },
    "default_value": {
      "type": Sequelize.STRING,
      "allowNull": true
    },
    "params": {
      "type": Sequelize.STRING,
      "allowNull": false
    },
    "value": {
      "type": Sequelize.STRING,
      "allowNull": true
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
  await queryInterface.dropTable('device_settings');
}

module.exports = {up, down};
