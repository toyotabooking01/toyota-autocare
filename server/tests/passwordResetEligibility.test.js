const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../models/User');
const EmailOtp = require('../models/EmailOtp');
const emailService = require('../services/emailService');
const otpService = require('../services/otpService');

function authEnvironment(t) {
  const names = ['OTP_HASH_SECRET', 'OTP_EXPIRY_MINUTES'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  process.env.OTP_HASH_SECRET = 'staff-password-recovery-regression-secret-0123456789';
  process.env.OTP_EXPIRY_MINUTES = '5';
  t.after(() => {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  });
}

function query(value) {
  return {
    sort() { return this; },
    select() { return this; },
    session() { return Promise.resolve(value); },
  };
}

test('password-reset eligibility includes all supported roles and preserves account restrictions', () => {
  const filter = otpService.eligible('password_reset');
  assert.equal(filter.isArchived, false);
  assert.equal(filter.status, 'active');
  assert.deepEqual(filter.$or, [
    { role: { $in: ['admin', 'staff', 'mechanic'] } },
    { role: 'client', emailVerified: true },
  ]);
});

test('Staff can request and verify a password-reset OTP without sending email', async t => {
  authEnvironment(t);
  const email = 'staff@example.invalid';
  const user = { _id: new mongoose.Types.ObjectId(), email, role: 'staff', status: 'active', isArchived: false };
  const staffOtpFilter = otpService.eligible('password_reset');
  const lock = t.mock.method(User, 'findOneAndUpdate', (_filter, _update, options) => {
    assert.deepEqual(_filter, { email, ...staffOtpFilter });
    assert.ok(options.session);
    return { select: async () => user };
  });
  t.mock.method(emailService, 'ensureConfigured', () => {});
  const sendEmail = t.mock.method(emailService, 'sendOtp', async challenge => {
    assert.equal(challenge.email, email);
    assert.equal(challenge.purpose, 'password_reset');
  });
  t.mock.method(mongoose.connection, 'transaction', async callback => callback({ recoveryTest: true }));
  let currentOtp = null;
  t.mock.method(EmailOtp, 'findOne', () => query(currentOtp));
  t.mock.method(EmailOtp, 'updateMany', async () => ({ acknowledged: true }));
  const otpRecord = { _id: new mongoose.Types.ObjectId() };
  const create = t.mock.method(EmailOtp, 'create', async ([record]) => {
    assert.equal(record.email, email);
    assert.equal(record.purpose, 'password_reset');
    return [otpRecord];
  });

  await otpService.requestOtp(email, 'password_reset');
  assert.equal(lock.mock.callCount(), 1);
  assert.equal(create.mock.callCount(), 1);
  assert.equal(sendEmail.mock.callCount(), 1);

  const code = '024680';
  const record = {
    otpHash: otpService.digest(email, 'password_reset', code),
    expiresAt: new Date(Date.now() + 60_000),
    attempts: 0,
    isUsed: false,
    async save() {},
  };
  currentOtp = record;
  const grant = await otpService.verifyOtp(email, code, 'password_reset');
  assert.ok(grant.resetToken);
  assert.equal(grant.expiresIn, 300);
  assert.equal(record.isUsed, true);
  assert.equal(record.attempts, 1);
  assert.equal(lock.mock.callCount(), 2);
  assert.equal(sendEmail.mock.callCount(), 1);
});
