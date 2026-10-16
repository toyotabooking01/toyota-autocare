const mongoose = require('mongoose');
const connectDatabase = require('./db');
const validateProductionConfig = require('./production');

let databasePromise = null;

async function initializeApp() {
  validateProductionConfig();
  if (mongoose.connection.readyState === 1) return;
  if (!databasePromise) {
    databasePromise = connectDatabase().finally(() => {
      // Retry failed connections and reconnect after a later disconnect.
      databasePromise = null;
    });
  }
  await databasePromise;
}

module.exports = initializeApp;
