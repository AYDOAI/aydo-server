const {Sequelize} = require('sequelize');

async function up({context: queryInterface}) {
    return queryInterface.addColumn('device_settings', 'required', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
}

async function down({context: queryInterface}) {
    return queryInterface.removeColumn('device_settings', 'required');
}

module.exports = { up, down };
