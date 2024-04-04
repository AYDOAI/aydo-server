const {Sequelize} = require('sequelize');

async function up({context: queryInterface}) {
  await queryInterface.createTable('stats', {
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
    "data": {
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
  }).then(() => {
    queryInterface.addIndex(
      'stats',
      ['device_capability_id', 'kind', 'created_at']
      , {}
    )
  });
}

async function down({context: queryInterface}) {
  await queryInterface.dropTable('stats');
}

module.exports = {up, down};
