const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const app = require('./app');
require('./models');
const connectDatabase = require('./config/db');
const validateProductionConfig = require('./config/production');

async function startServer() {
  validateProductionConfig();
  const port = Number(process.env.PORT || 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid PORT');
  }

  await connectDatabase();
  const server = app.listen(port, () => {
    console.log(`Toyota AutoCare API listening on port ${port}.`);
  });
  server.on('error', () => {
    console.error('API could not listen. Check PORT and whether it is already in use.');
    process.exit(1);
  });
}

startServer().catch(error => {
  // Avoid printing a connection URI or credentials from driver errors.
  const known = ['Missing required production configuration.', 'Invalid production CLIENT_ORIGIN.',
    'Invalid PORT', 'Authentication configuration is incomplete.'];
  console.error(known.includes(error.message) ? error.message
    : 'API startup failed. Check PORT, MONGO_URI, and Atlas network access.');
  process.exit(1);
});
