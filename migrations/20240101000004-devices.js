const {Sequelize} = require('sequelize');

async function up({context: queryInterface}) {
  await queryInterface.createTable('devices', {
    "id": {
      "type": Sequelize.INTEGER,
      "allowNull": false,
      "primaryKey": true,
      "autoIncrement": true
    },
    "ident": {
      "type": Sequelize.STRING,
      "allowNull": false
    },
    "identifier": {
      "type": Sequelize.STRING,
      "allowNull": true
    },
    "name": {
      "type": Sequelize.STRING,
      "allowNull": false
    },
    "driver_id": {
      "type": Sequelize.INTEGER,
      "allowNull": false,
      "references": {
        "model": {
          "tableName": "drivers",
          // "schema": "schema"
        },
        "key": "id"
      },
    },
    "zone_id": {
      "type": Sequelize.INTEGER,
      "allowNull": true,
      "references": {
        "model": {
          "tableName": "zones",
          // "schema": "schema"
        },
        "key": "id"
      },
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
    "parent_id": {
      "type": Sequelize.INTEGER,
      "allowNull": true
    },
    "disabled": {
      "type": Sequelize.BOOLEAN,
      "allowNull": true,
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
  await queryInterface.dropTable('devices');
}

module.exports = {up, down};
