const dns = require('node:dns');
const mongoose = require('mongoose');

async function connectDatabase({ dbName } = {}) {
  if (!process.env.MONGO_URI) {
    console.warn('MONGO_URI is not configured. Running in foundation mode without a database.');
    return;
  }

  // Use Cloudflare DNS to resolve Atlas SRV records on the local development environment.
  dns.setServers(['1.1.1.1', '1.0.0.1']);

  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    // Integration checks can target an isolated database on the same Atlas cluster.
    ...(dbName ? { dbName } : {}),
  });
  console.log('MongoDB connected.');
}

module.exports = connectDatabase;
