const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const User = require('../models/User');
const nodemailer = require('nodemailer');
const emailService = require('../services/emailService');
const otpService = require('../services/otpService');
const authService = require('../services/authService');
const { autoVerifyNewClient, emailDeliveryEnabled } = require('../config/emailBehavior');

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

test('Auto verification requires the exact development environment and explicit true flag', t => {
  environment(t, { NODE_ENV: undefined, DEV_AUTO_VERIFY_EMAIL: undefined, EMAIL_DELIVERY_ENABLED: undefined });
  assert.equal(autoVerifyNewClient(), false);
  assert.equal(emailDeliveryEnabled(), true);
  process.env.DEV_AUTO_VERIFY_EMAIL = 'true';
  for (const mode of ['production', 'staging', 'test', 'Development', '']) {
    process.env.NODE_ENV = mode;
    assert.equal(autoVerifyNewClient(), false);
  }
  process.env.NODE_ENV = 'development';
  assert.equal(autoVerifyNewClient(), true);
  process.env.DEV_AUTO_VERIFY_EMAIL = 'false';
  assert.equal(autoVerifyNewClient(), false);
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

const input = { fullName: 'Development Client', email: 'client@example.invalid', phone: '+639123456789',
  password: 'A long development passphrase', role: 'admin', emailVerified: true };

function mockDatabase(t) {
  const exists = t.mock.method(User, 'exists', async () => null);
  const create = t.mock.method(User, 'create', async ([data]) => [new User(data)]);
  t.mock.method(mongoose.connection, 'transaction', async callback => callback({}));
  return { exists, create };
}

test('Development registration hashes password, forces client, skips all OTP/mail configuration', async t => {
  environment(t, { NODE_ENV: 'development', DEV_AUTO_VERIFY_EMAIL: 'true', EMAIL_DELIVERY_ENABLED: 'false', OTP_HASH_SECRET: undefined });
  const database = mockDatabase(t);
  const otp = t.mock.method(otpService, 'createOtp', async () => { throw new Error('Must not run'); });
  const delivery = t.mock.method(otpService, 'deliver', async () => { throw new Error('Must not run'); });
  const result = await authService.register(input);
  assert.equal(result.user.role, 'client');
  assert.equal(result.user.emailVerified, true);
  assert.equal(result.user.password, undefined);
  const saved = database.create.mock.calls[0].arguments[0][0];
  assert.ok(await bcrypt.compare(input.password, saved.password));
  assert.equal(otp.mock.callCount(), 0);
  assert.equal(delivery.mock.callCount(), 0);
  database.exists.mock.mockImplementation(async () => ({ _id: 'reserved' }));
  await assert.rejects(authService.register(input), { status: 409 });
  assert.equal(database.create.mock.callCount(), 1);
});

test('Disabled bypass and production opt-in both preserve normal unverified registration and OTP delivery', async t => {
  environment(t, { NODE_ENV: 'development', DEV_AUTO_VERIFY_EMAIL: 'false', EMAIL_DELIVERY_ENABLED: 'true', OTP_HASH_SECRET: 'x'.repeat(64), OTP_EXPIRY_MINUTES: '5' });
  mockDatabase(t);
  t.mock.method(emailService, 'ensureConfigured', () => {});
  const challenge = { id: 'test-only' };
  const otp = t.mock.method(otpService, 'createOtp', async () => challenge);
  const delivery = t.mock.method(otpService, 'deliver', async value => assert.equal(value, challenge));
  for (const mode of ['development', 'production']) {
    process.env.NODE_ENV = mode;
    process.env.DEV_AUTO_VERIFY_EMAIL = mode === 'production' ? 'true' : 'false';
    const result = await authService.register(input);
    assert.equal(result.user.emailVerified, false);
    assert.equal(result.user.role, 'client');
  }
  assert.equal(otp.mock.callCount(), 2);
  assert.equal(delivery.mock.callCount(), 2);
});
