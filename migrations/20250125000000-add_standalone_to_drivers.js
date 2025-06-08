const {Sequelize} = require('sequelize');

async function up({context: queryInterface}) {
  await queryInterface.addColumn('drivers', 'standalone', {
    type: Sequelize.BOOLEAN,
    allowNull: true,
    defaultValue: false
  });
}

async function down({context: queryInterface}) {
  await queryInterface.removeColumn('drivers', 'standalone');
}

module.exports = {up, down}; 