const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const mongoose = require('mongoose');
const connectDatabase = require('../config/db');
const User = require('../models/User');
const createInitialAdmin = require('../services/bootstrapAdmin');

async function run() {
  if (!process.env.MONGO_URI) throw new Error('Missing database configuration');
  await connectDatabase();
  await User.init();
  await createInitialAdmin({
    fullName: process.env.BOOTSTRAP_ADMIN_NAME,
    email: process.env.BOOTSTRAP_ADMIN_EMAIL,
    phone: process.env.BOOTSTRAP_ADMIN_PHONE,
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
  });
  console.log('Initial admin created. No credentials are printed.');
}
run().catch(() => {
  console.error('Admin bootstrap failed. Check input, password policy, reserved email, and whether an admin already exists.');
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
