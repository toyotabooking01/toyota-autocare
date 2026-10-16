// Read-only. Supply the deployment's environment in the shell to inspect that
// database; dotenv never overwrites supplied environment values.
require('dotenv').config({ path: require('node:path').join(__dirname, '../.env'), quiet: true });
const mongoose = require('mongoose');
const { jwtConfig, otpConfig } = require('../config/auth');
const connectDatabase = require('../config/db');
const User = require('../models/User');
const validation = require('../utils/authValidation');

async function run() {
  for (const [name, check] of [['JWT configuration', jwtConfig], ['OTP configuration', otpConfig]]) {
    try { check(); console.log(`${name}: valid`); }
    catch { console.log(`${name}: invalid (values suppressed)`); process.exitCode = 1; }
  }
  if (!process.env.MONGO_URI) throw new Error();
  await connectDatabase();
  console.log(`Database ready: ${mongoose.connection.readyState === 1}`);
  const emailIndex = process.argv.indexOf('--email');
  if (emailIndex !== -1) {
    const email = validation.email(process.argv[emailIndex + 1]);
    const user = await User.findOne({ email }).select('role status isArchived emailVerified mustChangePassword').lean();
    console.log(JSON.stringify({ accountExists: Boolean(user), ...(user ? {
      role: user.role, status: user.status, archived: user.isArchived,
      emailVerified: user.emailVerified, mustChangePassword: user.mustChangePassword,
    } : {}) }));
  }
}

run().catch(() => {
  console.error('Authentication check failed. Check the supplied email, MONGO_URI, and database access. Details suppressed.');
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
