const bcrypt = require('bcrypt');
const User = require('../models/User');
const Counter = require('../models/Counter');
const HttpError = require('../utils/HttpError');
const temporaryPassword = require('../utils/temporaryPassword');
const emailService = require('./emailService');
const authValidation = require('../utils/authValidation');
const validate = require('../utils/validateForm');
const { normalizeMobile } = require('../../shared/accountValidation.mjs');

const fields = ['firstName', 'lastName', 'email', 'phone'];
const projection = 'firstName lastName fullName staffId email phone status isArchived createdAt updatedAt';
const counterKey = 'staffId';
const formatStaffId = sequence => `STF-${String(sequence).padStart(4, '0')}`;

function input(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
    || Object.keys(raw).some(key => !fields.includes(key))) throw new HttpError(400, 'Invalid or unsupported staff fields.');
  validate('staff', raw);
  const firstName = raw.firstName.trim().replace(/\s+/g, ' ');
  const lastName = raw.lastName.trim().replace(/\s+/g, ' ');
  return { firstName, lastName, fullName: `${firstName} ${lastName}`,
    email: authValidation.email(raw.email), phone: normalizeMobile(raw.phone) };
}

async function nextStaffId() {
  while (true) {
    let counter;
    try {
      counter = await Counter.findOneAndUpdate({ _id: counterKey }, { $inc: { sequence: 1 } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: false });
    } catch (error) {
      // Concurrent first upserts can race on the counter's unique _id.
      if (error.code === 11000) continue;
      throw error;
    }
    if (!Number.isSafeInteger(counter.sequence) || counter.sequence < 1) throw new HttpError(503, 'Staff ID sequence is unavailable.');
    const staffId = formatStaffId(counter.sequence);
    // Skip IDs held by staff created before the counter was introduced.
    if (!await User.exists({ staffId })) return staffId;
  }
}

async function previewNextStaffId() {
  const counter = await Counter.findById(counterKey).lean();
  let sequence = (counter?.sequence || 0) + 1;
  while (Number.isSafeInteger(sequence)) {
    const staffId = formatStaffId(sequence);
    if (!await User.exists({ staffId })) return staffId;
    sequence++;
  }
  throw new HttpError(503, 'Staff ID sequence is unavailable.');
}

async function create(raw) {
  const data = input(raw);
  if (await User.exists({ email: data.email })) throw new HttpError(409, 'Email already exists.', { email: 'Email already exists.' });
  try { emailService.ensureConfigured(); }
  catch { throw new HttpError(503, 'Staff account email is unavailable. No account was created.'); }

  const secret = temporaryPassword();
  const password = await bcrypt.hash(secret, 12);
  let created;
  while (!created) {
    const staffId = await nextStaffId();
    try {
      created = await User.create({ ...data, staffId, password, role: 'staff', status: 'active', emailVerified: true,
        mustChangePassword: true });
    } catch (error) {
      if (error.code === 11000 && (error.keyPattern?.staffId || error.keyValue?.staffId)) continue;
      if (error.code === 11000) throw new HttpError(409, 'Email already exists.', { email: 'Email already exists.' });
      throw error;
    }
  }

  let emailSent = true;
  try { await emailService.sendTemporaryPassword({ email: data.email, password: secret,
    accountType: 'staff', firstName: data.firstName, staffId: created.staffId }); }
  catch { emailSent = false; }
  await require('./engagementService').recordAccountEvent(created, 'created');
  return { item: { _id: created._id, firstName: created.firstName, lastName: created.lastName,
    fullName: created.fullName, email: created.email, phone: created.phone, staffId: created.staffId,
    status: created.status }, emailSent,
  message: emailSent ? 'Staff account created. Temporary sign-in details were emailed.'
    : 'Staff account created, but the sign-in email could not be sent. Do not create another account. Ask the staff member to use Forgot password when email delivery is available.' };
}

module.exports = { input, create, nextStaffId, previewNextStaffId, formatStaffId, projection };
