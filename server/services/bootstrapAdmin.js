const bcrypt = require('bcrypt');
const User = require('../models/User');
const validation = require('../utils/authValidation');
const HttpError = require('../utils/HttpError');

async function createInitialAdmin(input) {
  const values = validation.profile(input);
  if (await User.exists({ role: 'admin' })) throw new HttpError(409, 'An admin already exists; bootstrap refused.');
  const password = await bcrypt.hash(values.password, 12);
  // Only called from the explicit local script, never a public route or server startup.
  return User.create({ ...values, password, role: 'admin', emailVerified: true });
}
module.exports = createInitialAdmin;
