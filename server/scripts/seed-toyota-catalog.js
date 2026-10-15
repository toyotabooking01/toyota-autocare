const path = require('node:path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const connectDatabase = require('../config/db');
const catalog = require('../services/toyotaCatalogService');
const { ensureOtherService } = require('../services/bootstrapServices');

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not configured.');
  await connectDatabase();
  await catalog.seed();
  await ensureOtherService();
  console.log('Toyota Philippines catalog and diagnostic service seeded.');
}

main().catch(() => {
  console.error('Toyota catalog seed failed. Check MongoDB connectivity and credentials.');
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
