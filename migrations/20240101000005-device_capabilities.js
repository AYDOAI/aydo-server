const {Sequelize} = require('sequelize');

async function up({context: queryInterface}) {
  await queryInterface.createTable('device_capabilities', {
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
    "ident": {
      "type": Sequelize.STRING,
      "allowNull": false
    },
    "index": {
      "type": Sequelize.STRING,
      "allowNull": false
    },
    "name": {
      "type": Sequelize.STRING,
      "allowNull": false
    },
    "display_name": {
      "type": Sequelize.STRING,
      "allowNull": false
    },
    "options": {
      "type": Sequelize.STRING,
      "allowNull": false
    },
    "params": {
      "type": Sequelize.STRING,
      "allowNull": false
    },
    "value": {
      "type": Sequelize.STRING,
      "allowNull": true
    },
    "hidden": {
      "type": Sequelize.BOOLEAN,
      "allowNull": false,
      "defaultValue": false,
    },
    "disabled": {
      "type": Sequelize.BOOLEAN,
      "allowNull": false,
      "defaultValue": false,
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
  await queryInterface.dropTable('device_capabilities');
}

module.exports = {up, down};
