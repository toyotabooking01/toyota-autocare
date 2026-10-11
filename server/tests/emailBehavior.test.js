const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const User = require('../models/User');
const nodemailer = require('nodemailer');
const emailService = require('../services/emailService');
const otpService = require('../services/otpService');
const authService = require('../services/authService');
const { emailDeliveryEnabled } = require('../config/emailBehavior');

function environment(t, values) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test('Email delivery is enabled by default and can be explicitly disabled', t => {
  environment(t, { EMAIL_DELIVERY_ENABLED: undefined });
  assert.equal(emailDeliveryEnabled(), true);
  process.env.EMAIL_DELIVERY_ENABLED = 'false';
  assert.equal(emailDeliveryEnabled(), false);
});

test('Delivery switch blocks transport creation without pretending to send mail', async t => {
  environment(t, { EMAIL_DELIVERY_ENABLED: 'false' });
  const transport = t.mock.method(nodemailer, 'createTransport', () => { throw new Error('Must not run'); });
  assert.throws(() => emailService.ensureConfigured(), { status: 503 });
  for (const purpose of ['email_verification', 'password_reset']) {
    await assert.rejects(emailService.sendOtp({ email: 'test@example.invalid', code: '000000', purpose, minutes: 5 }), { status: 503 });
  }
  assert.equal(transport.mock.callCount(), 0);
});

const input = { firstName: 'Development', lastName: 'Client', fullName: 'Development Client', email: 'client@example.invalid', phone: '+639123456789',
  password: 'A long development passphrase42!', confirmPassword: 'A long development passphrase42!', termsAccepted: true, role: 'admin', emailVerified: true };

function mockDatabase(t) {
  const exists = t.mock.method(User, 'exists', async () => null);
  const create = t.mock.method(User, 'create', async ([data]) => [new User(data)]);
  t.mock.method(mongoose.connection, 'transaction', async callback => callback({}));
  return { exists, create };
}

test('Legacy development bypass cannot create an account without OTP and mail configuration', async t => {
  environment(t, { NODE_ENV: 'development', DEV_AUTO_VERIFY_EMAIL: 'true', EMAIL_DELIVERY_ENABLED: 'false', OTP_HASH_SECRET: undefined });
  const database = mockDatabase(t);
  const otp = t.mock.method(otpService, 'createOtp', async () => { throw new Error('Must not run'); });
  const delivery = t.mock.method(otpService, 'deliver', async () => { throw new Error('Must not run'); });
  await assert.rejects(authService.register(input), { status: 503 });
  assert.equal(otp.mock.callCount(), 0);
  assert.equal(delivery.mock.callCount(), 0);
  assert.equal(database.create.mock.callCount(), 0);
});

test('Every environment requires OTP delivery and an unverified account even with legacy bypass enabled', async t => {
  environment(t, { NODE_ENV: 'development', DEV_AUTO_VERIFY_EMAIL: 'true', EMAIL_DELIVERY_ENABLED: 'true', OTP_HASH_SECRET: 'x'.repeat(64), OTP_EXPIRY_MINUTES: '5' });
  const database = mockDatabase(t);
  t.mock.method(emailService, 'ensureConfigured', () => {});
  const challenge = { id: 'test-only' };
  const otp = t.mock.method(otpService, 'createOtp', async () => challenge);
  const delivery = t.mock.method(otpService, 'deliver', async value => assert.equal(value, challenge));
  for (const mode of ['development', 'production', 'staging']) {
    process.env.NODE_ENV = mode;
    const result = await authService.register(input);
    assert.equal(result.user.emailVerified, false);
    assert.equal(result.user.role, 'client');
    assert.equal(result.user.password, undefined);
    assert.equal(result.accessToken, undefined);
  }
  const saved = database.create.mock.calls[0].arguments[0][0];
  assert.ok(await bcrypt.compare(input.password, saved.password));
  assert.equal(otp.mock.callCount(), 3);
  assert.equal(delivery.mock.callCount(), 3);
  database.exists.mock.mockImplementation(async () => ({ _id: 'reserved' }));
  await assert.rejects(authService.register(input), { status: 409 });
  assert.equal(database.create.mock.callCount(), 3);
});
