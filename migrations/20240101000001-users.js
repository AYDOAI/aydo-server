const {Sequelize} = require('sequelize');

async function up({context: queryInterface}) {
  await queryInterface.createTable('users', {
    "id": {
      "type": Sequelize.INTEGER,
      "allowNull": false,
      "primaryKey": true,
      "autoIncrement": true
    },
    "name": {
      "type": Sequelize.STRING,
      "allowNull": true
    },
    "login": {
      "type": Sequelize.STRING(64),
      "allowNull": false
    },
    "password": {
      "type": Sequelize.STRING,
      "allowNull": false
    },
    "is_active": {
      "type": Sequelize.BOOLEAN,
      "allowNull": false,
      "defaultValue": false,
    },
    "is_admin": {
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
  }).then(() => {
    queryInterface.addIndex('users', ['login'], {"indicesType": "UNIQUE"})
  });
}

async function down({context: queryInterface}) {
  await queryInterface.dropTable('users');
}

module.exports = {up, down};
