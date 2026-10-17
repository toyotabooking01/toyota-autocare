const mongoose = require('mongoose');
const connectDatabase = require('./db');
const validateProductionConfig = require('./production');

let databasePromise = null;
let serviceTypeMigrationPromise = null;

async function backfillLegacyServiceTypes() {
  if (!serviceTypeMigrationPromise) {
    serviceTypeMigrationPromise = require('../services/serviceTypeMigration').backfillLegacyServiceTypes()
      .catch(error => { serviceTypeMigrationPromise = null; throw error; });
  }
  await serviceTypeMigrationPromise;
}

async function initializeApp() {
  validateProductionConfig();
  if (mongoose.connection.readyState !== 1) {
    if (!databasePromise) {
      databasePromise = connectDatabase().finally(() => {
        // Retry failed connections and reconnect after a later disconnect.
        databasePromise = null;
      });
    }
    await databasePromise;
  }
  await backfillLegacyServiceTypes();
}

module.exports = initializeApp;
