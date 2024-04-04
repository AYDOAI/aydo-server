const {Sequelize} = require('sequelize');

async function up({context: queryInterface}) {
  await queryInterface.createTable('drivers', {
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
    "description": {
      "type": Sequelize.STRING,
      "allowNull": true
    },
    "class_name": {
      "type": Sequelize.STRING,
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
  await queryInterface.dropTable('drivers');
}

module.exports = {up, down};
