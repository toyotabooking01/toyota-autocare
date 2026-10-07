const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
process.env.OTP_HASH_SECRET = crypto.randomBytes(32).toString('hex');
process.env.JWT_EXPIRES_IN = '1h';
delete process.env.OTP_EXPIRY_MINUTES;
const validation = require('../utils/authValidation');
const safeUser = require('../utils/safeUser');
const { jwtConfig, otpConfig } = require('../config/auth');
const tokenService = require('../services/tokenService');
const otpService = require('../services/otpService');
const emailService = require('../services/emailService');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const rateLimit = require('../middleware/rateLimit');
const errorHandler = require('../middleware/errorHandler');
const User = require('../models/User');
const EmailOtp = require('../models/EmailOtp');

const input = { fullName: ' Test Client ', email: ' CLIENT@Example.invalid ', phone: '+63 912 345 6789',
  password: 'A long test passphrase 42!' };

test('Registration allowlist forces public callers to supply only client profile fields', () => {
  const result = validation.registration({ ...input, role: 'admin', emailVerified: true, authVersion: 100, isArchived: true });
  assert.deepEqual(Object.keys(result).sort(), ['email', 'fullName', 'password', 'phone']);
  assert.equal(result.email, 'client@example.invalid');
  assert.equal(result.fullName, 'Test Client');
});

test('Password validation prevents weak values, mismatch and bcrypt byte truncation', () => {
  assert.throws(() => validation.password('short'));
  assert.throws(() => validation.password('a'.repeat(73)));
  assert.throws(() => validation.password('🌟'.repeat(19)));
  assert.throws(() => validation.password(input.password, 'different'));
  assert.equal(validation.password('a'.repeat(72)), 'a'.repeat(72));
  assert.equal(validation.password(input.password), input.password);
});

test('Request validators reject object injection, malformed profiles and malformed OTPs', () => {
  for (const value of [undefined, [], 'text']) assert.throws(() => validation.body(value));
  assert.throws(() => validation.email({ $ne: null }));
  assert.throws(() => validation.email('extra,recipient@example.invalid'));
  assert.throws(() => validation.registration({ ...input, phone: '' }));
  assert.throws(() => validation.registration({ ...input, fullName: ' ' }));
  for (const code of [123456, '12345', '1234567', 'ABCDEF']) {
    assert.throws(() => validation.otp({ email: input.email, otp: code }));
  }
  assert.equal(validation.otp({ email: input.email, otp: '012345' }).otp, '012345');
});

test('Safe user and model JSON never expose password, OTP/reset digests or internal counters', () => {
  const user = new User({ ...input, password: '$2b$12$' + 'a'.repeat(53) });
  for (const result of [safeUser(user), user.toJSON()]) {
    for (const field of ['password', 'authVersion', 'otpSequence']) assert.equal(result[field], undefined);
  }
  const otp = new EmailOtp({ email: input.email, otpHash: 'a'.repeat(64), resetTokenHash: 'b'.repeat(64),
    purpose: 'password_reset', expiresAt: new Date() });
  assert.equal(otp.toJSON().otpHash, undefined);
  assert.equal(otp.toJSON().resetTokenHash, undefined);
  assert.equal(EmailOtp.schema.path('resetTokenHash').options.select, false);
});

test('OTP digests are keyed, deterministic, and bound to email and purpose', () => {
  const hash = otpService.digest('a@example.invalid', 'email_verification', '012345');
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(hash, otpService.digest('a@example.invalid', 'email_verification', '012345'));
  assert.notEqual(hash, otpService.digest('b@example.invalid', 'email_verification', '012345'));
  assert.notEqual(hash, otpService.digest('a@example.invalid', 'password_reset', '012345'));
  assert.notEqual(hash, crypto.createHash('sha256').update('012345').digest('hex'));
});

test('JWT signature, expiry, algorithm, issuer and audience are enforced', () => {
  const user = { _id: new mongoose.Types.ObjectId(), role: 'client', authVersion: 2 };
  const token = tokenService.signAccessToken(user);
  const payload = tokenService.verifyAccessToken(token);
  assert.equal(payload.sub, String(user._id));
  assert.equal(payload.version, 2);
  assert.equal(payload.email, undefined);
  const config = jwtConfig();
  const options = { algorithm: 'HS256', issuer: config.issuer, audience: config.audience };
  assert.throws(() => tokenService.verifyAccessToken(jwt.sign({}, config.secret, { ...options, expiresIn: -1 })));
  assert.throws(() => tokenService.verifyAccessToken(jwt.sign({}, config.secret, { ...options, audience: 'other' })));
  assert.throws(() => tokenService.verifyAccessToken(jwt.sign({}, config.secret, { ...options, issuer: 'other' })));
  assert.throws(() => tokenService.verifyAccessToken(jwt.sign({}, config.secret, { ...options, algorithm: 'HS384' })));
  assert.throws(() => tokenService.verifyAccessToken(jwt.sign({}, 'incorrect-secret', options)));
});

test('Authentication loads current roles and rejects revoked, inactive, archived or unverified users', async t => {
  const user = { _id: new mongoose.Types.ObjectId(), role: 'client', authVersion: 0,
    status: 'active', isArchived: false, emailVerified: true };
  const token = tokenService.signAccessToken({ ...user, role: 'admin' });
  t.mock.method(User, 'findById', () => ({ select: async () => user }));
  async function run(authorization = `Bearer ${token}`) {
    const req = { get: () => authorization };
    let failure;
    await authenticate(req, {}, error => { failure = error; });
    return { req, failure };
  }
  assert.equal((await run()).req.user.role, 'client');
  assert.equal((await run('')).failure.status, 401);
  assert.equal((await run('Bearer invalid')).failure.status, 401);
  for (const change of [{ authVersion: 1 }, { isArchived: true }, { status: 'inactive' }, { emailVerified: false }]) {
    const before = { ...user };
    Object.assign(user, change);
    assert.equal((await run()).failure.status, 401);
    Object.assign(user, before);
  }
});

test('Authorization permits only the current allowed roles', () => {
  for (const allowed of [['client'], ['mechanic'], ['admin'], ['admin', 'mechanic']]) {
    for (const role of ['client', 'mechanic', 'admin']) {
      let error;
      authorize(...allowed)({ user: { role } }, {}, value => { error = value; });
      assert.equal(error?.status, allowed.includes(role) ? undefined : 403);
    }
  }
  let error;
  authorize('admin')({}, {}, value => { error = value; });
  assert.equal(error.status, 401);
  assert.throws(() => authorize('superadmin'));
});

test('Rate limiter returns 429 and Retry-After without trusting client-supplied email', () => {
  const limit = rateLimit({ limit: 2, windowMs: 60000 });
  const headers = {};
  let error;
  const res = { set: (key, value) => { headers[key] = value; } };
  for (let i = 0; i < 3; i += 1) limit({ ip: '127.0.0.1' }, res, value => { error = value; });
  assert.equal(error.status, 429);
  assert.ok(Number(headers['Retry-After']) > 0);
});

test('Configuration rejects unsafe secrets and unbounded expiry', () => {
  const secret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'short';
  assert.throws(() => jwtConfig(), { status: 503 });
  process.env.JWT_SECRET = secret;
  process.env.JWT_EXPIRES_IN = '100d';
  assert.throws(() => jwtConfig(), { status: 503 });
  process.env.JWT_EXPIRES_IN = '1h';
  assert.equal(otpConfig().minutes, 5);
  process.env.OTP_EXPIRY_MINUTES = '0';
  assert.throws(() => otpConfig(), { status: 503 });
  delete process.env.OTP_EXPIRY_MINUTES;
});

test('Brevo transport requires TLS, uses SMTP credentials and produces minimal OTP emails', async t => {
  process.env.BREVO_SMTP_USER = 'fixture-user';
  process.env.BREVO_SMTP_PASS = 'fixture-pass';
  process.env.EMAIL_FROM = 'Toyota AutoCare <sender@example.invalid>';
  let options;
  let message;
  let closed = false;
  t.mock.method(nodemailer, 'createTransport', value => {
    options = value;
    return { sendMail: async mail => { message = mail; return { accepted: [mail.to] }; }, close: () => { closed = true; } };
  });
  await emailService.sendOtp({ email: 'recipient@example.invalid', code: '012345', purpose: 'email_verification', minutes: 5 });
  assert.equal(options.host, 'smtp-relay.brevo.com');
  assert.equal(options.requireTLS, true);
  assert.equal(options.logger, false);
  assert.equal(options.auth.pass, 'fixture-pass');
  assert.match(message.text, /012345/);
  assert.match(message.html, /Toyota AutoCare/);
  assert.equal(closed, true);
  delete process.env.BREVO_SMTP_PASS;
  assert.throws(() => emailService.ensureConfigured(), { status: 503 });
});

test('Unexpected errors never expose their message or stack through the API', () => {
  let status;
  let body;
  const res = { status: value => { status = value; return res; }, json: value => { body = value; } };
  errorHandler(new Error('private SMTP credentials'), {}, res, () => {});
  assert.equal(status, 500);
  assert.deepEqual(body, { message: 'Request could not be processed' });
});

test('SMTP failures are sanitized and transport is closed', async t => {
  process.env.BREVO_SMTP_USER = 'fixture-user';
  process.env.BREVO_SMTP_PASS = 'fixture-pass';
  process.env.EMAIL_FROM = 'sender@example.invalid';
  let closed = false;
  t.mock.method(nodemailer, 'createTransport', () => ({
    sendMail: async () => { throw new Error('private SMTP credential detail'); },
    close: () => { closed = true; },
  }));
  await assert.rejects(emailService.sendOtp({ email: 'recipient@example.invalid', code: '012345',
    purpose: 'password_reset', minutes: 5 }), error => error.status === 503 && !error.message.includes('private'));
  assert.equal(closed, true);
  delete process.env.BREVO_SMTP_PASS;
});
