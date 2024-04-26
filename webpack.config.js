const path = require('path');

module.exports = {
  entry: {
    'server': './src/server.ts'
  },
  mode: 'production',
  target: 'node',
  node: {
    __dirname: true,
  },
  externals: [
    function (context, request, callback) {
      if (['assert', 'buffer', 'child_process', 'curve25519-n2', 'crypto', 'dgram', 'decimal.js', 'ed25519', 'events',
        'fast-srp-hap', 'fs', 'getmac', 'http', 'mdns', 'mqtt', 'net', 'noble', 'noble-mac', 'os', 'path', 'sequelize',
        'sodium', 'tls', 'url', 'util', 'uws', 'zigbee-herdsman', 'modbus-serial', 'openzwave-shared', 'serialport',
        'socket.io', 'ws', 'socket.io-client', 'hap-nodejs'
      ].indexOf(request) !== -1) {
        return callback(null, `require('${request}')`);
      } else if (request.indexOf('../config/config') !== -1) {
        return callback(null, `require('./config/config')`);
      } else if (request.indexOf('/locale/') !== -1) {
        return callback(null, `require('${request.substring(1, request.length)}')`);
      } else if (context.indexOf('/templates') === context.length - 10) {
        return callback(null, `./templates/${request}`, 'commonjs2');
      }
      const i = request.indexOf('.d.ts');
      const ext = request.substring(request.lastIndexOf('.'), request.length);
      if (['.proto', '.css', '.md', '.txt', '.html', '.png', '.jpg', '.eot', '.woff2', '.woff', '.otf', '.ttf'].indexOf(ext) !== -1 ||
        (i !== -1 && i === request.length - 5)) {
        return callback(null, `require('${request}')`);
      }
      callback();
    }
  ],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: [/templates/, /node_modules/, /migrations/]
      }
    ]
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js']
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, './')
  }
};
