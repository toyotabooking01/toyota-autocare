const path = require('node:path');

require('dotenv').config({
  path: path.join(__dirname, '.env'),
  quiet: true,
});

const app = require('./app');
require('./models');

const connectDatabase = require('./config/db');
const validateProductionConfig = require('./config/production');

let databasePromise = null;

async function initializeApp() {
  validateProductionConfig();

  if (!databasePromise) {
    databasePromise = connectDatabase().catch((error) => {
      databasePromise = null;
      throw error;
    });
  }

  await databasePromise;
}

async function handler(req, res) {
  try {
    await initializeApp();
    return app(req, res);
  } catch (error) {
    console.error('API initialization failed.');

    return res.status(500).json({
      message: 'API initialization failed.',
    });
  }
}

async function startServer() {
  await initializeApp();

  const port = Number(process.env.PORT || 5000);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid PORT');
  }

  const server = app.listen(port, () => {
    console.log(`Toyota AutoCare API listening on port ${port}.`);
  });

  server.on('error', () => {
    console.error(
      'API could not listen. Check PORT and whether it is already in use.'
    );
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    const known = [
      'Missing required production configuration.',
      'Invalid production CLIENT_ORIGIN.',
      'Invalid PORT',
      'Authentication configuration is incomplete.',
    ];

    console.error(
      known.includes(error.message)
        ? error.message
        : 'API startup failed. Check PORT, MONGO_URI, and Atlas network access.'
    );

    process.exitCode = 1;
  });
}

module.exports = handler;