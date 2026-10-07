const path = require('node:path');
const { randomUUID } = require('node:crypto');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const connectDatabase = require('../config/db');
const User = require('../models/User');
const validation = require('../utils/authValidation');

let failureMessage = 'Development bootstrap refused: NODE_ENV must be development.';

async function run() {
  // Exact opt-in: production, test, unset, and unknown environments cannot write users.
  if (process.env.NODE_ENV !== 'development') throw new Error();
  failureMessage = 'Development bootstrap failed: check all four DEV account variables, distinct valid emails, and passwords (12+ characters, at most 72 UTF-8 bytes).';
  const accounts = ['admin', 'mechanic'].map(role => {
    const prefix = `DEV_${role.toUpperCase()}`;
    return {
      role,
      email: validation.email(process.env[`${prefix}_EMAIL`]),
      password: validation.password(process.env[`${prefix}_PASSWORD`]),
    };
  });
  if (accounts[0].email === accounts[1].email) throw new Error();
  failureMessage = 'Development bootstrap failed: check database configuration and connectivity.';
  if (!process.env.MONGO_URI) throw new Error();
  await connectDatabase();
  await User.init();

  for (const account of accounts) {
    failureMessage = `Development ${account.role} bootstrap failed. Check database connectivity and model constraints; existing accounts were not overwritten.`;
    if (await User.exists({ email: account.email })) {
      console.log(`${account.role}: email already exists; skipped without changes.`);
      continue;
    }
    try {
      await User.create({
        fullName: account.role === 'admin' ? 'Development Admin' : 'Development Mechanic',
        email: account.email,
        // Matches existing authentication and admin bootstrap hashing behavior.
        password: await bcrypt.hash(account.password, 12),
        role: account.role,
        emailVerified: true,
        status: 'active',
        isArchived: false,
        availability: account.role === 'mechanic' ? 'available' : 'off_duty',
        ...(account.role === 'mechanic' ? { employeeId: `DEV-MECH-${randomUUID()}` } : {}),
      });
      console.log(`${account.role}: created successfully (verified, active).`);
    } catch (error) {
      // A simultaneous bootstrap may have reserved the same email first.
      if (error.code === 11000 && await User.exists({ email: account.email })) {
        console.log(`${account.role}: email already exists; skipped without changes.`);
      } else {
        throw error;
      }
    }
  }
}

run().catch(() => {
  // Never print raw database/validation errors: they may contain credentials.
  console.error(failureMessage);
  process.exitCode = 1;
}).finally(async () => {
  try { await mongoose.disconnect(); } catch {
    console.error('Development bootstrap database disconnect failed.');
    process.exitCode = 1;
  }
});
