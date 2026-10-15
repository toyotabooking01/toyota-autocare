const path = require('node:path');
const { randomUUID } = require('node:crypto');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const connectDatabase = require('../config/db');
const User = require('../models/User');
const validation = require('../utils/authValidation');
const developmentAdminEmail = 'admin@toyota.com';
const previousDevelopmentAdminEmail = 'deramarichmond@gmail.com';

let failureMessage = 'Development bootstrap refused: NODE_ENV must be development.';

async function run() {
  // Exact opt-in: production, test, unset, and unknown environments cannot write users.
  if (process.env.NODE_ENV !== 'development') throw new Error();
  failureMessage = 'Development bootstrap failed: check both DEV account emails, set DEV_ADMIN_EMAIL to admin@toyota.com, and use distinct valid emails.';
  const accounts = ['admin', 'mechanic'].map(role => {
    const prefix = `DEV_${role.toUpperCase()}`;
    return {
      role,
      email: validation.email(process.env[`${prefix}_EMAIL`]),
      password: process.env[`${prefix}_PASSWORD`],
    };
  });
  if (accounts[0].email === accounts[1].email) throw new Error();
  if (accounts[0].email !== developmentAdminEmail) throw new Error();
  failureMessage = 'Development bootstrap failed: check database configuration and connectivity.';
  if (!process.env.MONGO_URI) throw new Error();
  await connectDatabase();
  await User.init();

  for (const account of accounts) {
    failureMessage = `Development ${account.role} bootstrap failed. Check database connectivity, email conflicts, and model constraints.`;
    if (account.role === 'admin') {
      const admins = await User.find({ role: 'admin' }).select('email').lean();
      if (admins.length > 1 || (admins.length === 1
        && ![account.email, previousDevelopmentAdminEmail].includes(admins[0].email))) throw new Error();
      if (admins.length === 1) {
        const existing = admins[0];
        if (existing.email !== account.email && await User.exists({ $or: [
          { email: account.email }, { contactEmail: account.email },
        ] })) throw new Error();
        const updated = await User.findOneAndUpdate({ _id: existing._id, role: 'admin', email: existing.email },
          { $set: { email: account.email, firstName: 'Admin', lastName: 'Toyota', fullName: 'Admin Toyota' },
            ...(existing.email !== account.email ? { $inc: { authVersion: 1 } } : {}) },
          { returnDocument: 'after', runValidators: true });
        if (!updated) throw new Error();
        console.log(`admin: existing development account ${existing.email === account.email ? 'confirmed' : 'updated'}; password retained.`);
        continue;
      }
      if (await User.exists({ $or: [{ email: account.email }, { contactEmail: account.email }] })) throw new Error();
    }
    if (await User.exists({ email: account.email })) {
      console.log(`${account.role}: email already exists; skipped without changes.`);
      continue;
    }
    failureMessage = `Development ${account.role} bootstrap failed: a new account requires a valid password (12+ characters, at most 72 UTF-8 bytes), a unique email, and a working database.`;
    const password = validation.password(account.password);
    try {
      await User.create({
        fullName: account.role === 'admin' ? 'Admin Toyota' : 'Development Mechanic',
        ...(account.role === 'admin' ? { firstName: 'Admin', lastName: 'Toyota' } : {}),
        email: account.email,
        // Matches existing authentication and admin bootstrap hashing behavior.
        password: await bcrypt.hash(password, 12),
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
