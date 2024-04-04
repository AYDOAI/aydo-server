const {Sequelize} = require('sequelize');

async function up({context: queryInterface}) {
  await queryInterface.createTable('events', {
    "id": {
      "type": Sequelize.INTEGER,
      "allowNull": false,
      "primaryKey": true,
      "autoIncrement": true
    },
    "kind": {
      "type": Sequelize.INTEGER,
      "allowNull": false
    },
    "user_id": {
      "type": Sequelize.INTEGER,
      "allowNull": false,
      "references": {
        "model": {
          "tableName": "users",
          // "schema": "schema"
        },
        "key": "id"
      },
    },
    "device_id": {
      "type": Sequelize.INTEGER,
      "allowNull": true,
      "references": {
        "model": {
          "tableName": "devices",
          // "schema": "schema"
        },
        "key": "id"
      },
    },
    "device_capability_id": {
      "type": Sequelize.INTEGER,
      "allowNull": true,
      "references": {
        "model": {
          "tableName": "device_capabilities",
          // "schema": "schema"
        },
        "key": "id"
      },
    },
    "description": {
      "type": Sequelize.TEXT('medium'),
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
  await queryInterface.dropTable('events');
}

module.exports = {up, down};
