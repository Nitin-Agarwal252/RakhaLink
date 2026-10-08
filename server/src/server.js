const config = require('./config');
const app = require('./app');

if (require.main === module) {
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`RakshaLink API listening on 0.0.0.0:${config.port}`);
  });
}

module.exports = app;
