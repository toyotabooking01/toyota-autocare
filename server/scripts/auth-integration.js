// Opt-in Atlas tests. SMTP is intercepted only in this process; no real email is sent.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { once } = require('node:events');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
process.env.OTP_HASH_SECRET = crypto.randomBytes(32).toString('hex');
process.env.JWT_EXPIRES_IN = '1h';
process.env.OTP_EXPIRY_MINUTES = '5';

const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const connectDatabase = require('../config/db');
const User = require('../models/User');
const EmailOtp = require('../models/EmailOtp');
const emailService = require('../services/emailService');
const createInitialAdmin = require('../services/bootstrapAdmin');
const authorize = require('../middleware/authorize');
const { jwtConfig } = require('../config/auth');
const app = require('../app');
const databaseName = `tac_${crypto.randomUUID().replaceAll('-', '')}`;
const messages = [];
const originalSend = emailService.sendOtp;
const originalCheck = emailService.ensureConfigured;
const intercept = async message => { messages.push(message); };
emailService.ensureConfigured = () => {};
emailService.sendOtp = intercept;
const profile = { fullName: 'Temporary Auth Client', email: ' AUTH@example.invalid ', phone: '+63 912 345 6789',
  password: 'Original test passphrase 42!', confirmPassword: 'Original test passphrase 42!' };
const email = profile.email.trim().toLowerCase();
const newPassword = 'Replacement test passphrase 43!';
let server;
let baseURL;
let stage = 'connect';
let checks = 0;

function passed(message) { checks += 1; console.log(`PASS: ${message}`); }
function privateFieldsAbsent(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    assert.ok(!['password', 'otpHash', 'resetTokenHash', 'authVersion', 'otpSequence'].includes(key));
    privateFieldsAbsent(item);
  }
}
async function request(route, body, expected, token) {
  const response = await fetch(baseURL + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  assert.equal(response.status, expected, `${stage}: ${route} returned ${response.status}, expected ${expected}`);
  privateFieldsAbsent(result);
  if (route.startsWith('/api/auth')) assert.equal(response.headers.get('cache-control'), 'no-store');
  return result;
}
function latest(purpose) {
  const message = messages.findLast(item => item.email === email && item.purpose === purpose);
  assert.ok(message);
  return message;
}
function wrong(code) { return code === '000000' ? '000001' : '000000'; }
async function allowResend(purpose) {
  // Test-only clock adjustment, only inside the guarded disposable database.
  assert.equal(mongoose.connection.name, databaseName);
  await EmailOtp.collection.updateMany({ email, purpose }, { $set: { createdAt: new Date(Date.now() - 61000) } });
}

async function run() {
  assert.ok(process.env.MONGO_URI, 'MONGO_URI is required.');
  try {
    await connectDatabase({ dbName: databaseName });
    assert.equal(mongoose.connection.name, databaseName);
    console.log(`Temporary database: ${databaseName}`);
    await User.init();
    await EmailOtp.init();
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseURL = `http://127.0.0.1:${server.address().port}`;

    stage = 'registration and password hashing';
    const registered = await request('/api/auth/register', { ...profile, role: 'admin', emailVerified: true, isArchived: true }, 201);
    assert.equal(registered.user.role, 'client');
    assert.equal(registered.user.emailVerified, false);
    let user = await User.findOne({ email }).select('+password');
    assert.equal(user.isArchived, false);
    assert.equal(user.role, 'client');
    assert.ok(await bcrypt.compare(profile.password, user.password));
    assert.equal(bcrypt.getRounds(user.password), 12);
    await request('/api/auth/register', { ...profile, email: 'auth@EXAMPLE.INVALID' }, 409);
    const forced = await request('/api/auth/register', { ...profile, email: 'forced@example.invalid', role: 'mechanic', employeeId: 'M-ATTACK' }, 201);
    assert.equal(forced.user.role, 'client');
    assert.equal((await User.findById(forced.user.id)).employeeId, undefined);
    await request('/api/auth/register', { ...profile, email: 'invalid@example.invalid', confirmPassword: 'mismatch' }, 400);
    assert.equal(await User.countDocuments({ email: 'invalid@example.invalid' }), 0);
    await request('/api/auth/login', { email, password: profile.password }, 403);
    const invalid = await request('/api/auth/login', { email, password: 'wrong password' }, 401);
    assert.deepEqual(await request('/api/auth/login', { email: 'unknown@example.invalid', password: 'wrong password' }, 401), invalid);
    passed('registration normalizes email, hashes passwords, rejects duplicates and forces client role');

    stage = 'OTP expiry, attempts and resend';
    const initial = latest('email_verification');
    assert.match(initial.code, /^\d{6}$/);
    let record = await EmailOtp.findById(initial.id).select('+otpHash');
    assert.match(record.otpHash, /^[a-f0-9]{64}$/);
    assert.notEqual(record.otpHash, initial.code);
    assert.ok(record.expiresAt.getTime() - record.createdAt.getTime() <= 300000);
    await request('/api/auth/verify-email', { email, otp: wrong(initial.code) }, 400);
    assert.equal((await EmailOtp.findById(initial.id)).attempts, 1);
    await EmailOtp.updateOne({ _id: initial.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await request('/api/auth/verify-email', { email, otp: initial.code }, 400);
    await allowResend('email_verification');
    let before = messages.length;
    const resends = await Promise.all(Array.from({ length: 3 }, () => request('/api/auth/resend-verification', { email }, 202)));
    assert.deepEqual(resends[0], resends[1]);
    assert.equal(messages.length, before + 1);
    const replacement = latest('email_verification');
    assert.notEqual(replacement.code, initial.code);
    assert.equal(await EmailOtp.countDocuments({ email, purpose: 'email_verification', isUsed: false }), 1);
    before = messages.length;
    await request('/api/auth/resend-verification', { email }, 202);
    assert.equal(messages.length, before);
    for (let i = 0; i < 5; i += 1) {
      await request('/api/auth/verify-email', { email, otp: wrong(replacement.code) }, 400);
    }
    record = await EmailOtp.findById(replacement.id);
    assert.equal(record.attempts, 5);
    assert.equal(record.isUsed, true);
    await request('/api/auth/verify-email', { email, otp: replacement.code }, 400);
    await allowResend('email_verification');
    await request('/api/auth/resend-verification', { email }, 202);
    const verification = latest('email_verification');
    await request('/api/auth/verify-email', { email, otp: replacement.code }, 400);
    const verifyResponses = await Promise.all(Array.from({ length: 2 }, async () => {
      const response = await fetch(baseURL + '/api/auth/verify-email', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, otp: verification.code }) });
      return response.status;
    }));
    assert.deepEqual(verifyResponses.sort(), [200, 400]);
    assert.equal((await User.findOne({ email })).emailVerified, true);
    passed('OTP expiry, persisted attempt limits, resend cooldown/invalidation and concurrent one-time verification');

    stage = 'login, JWT and current user';
    const loggedIn = await request('/api/auth/login', { email, password: profile.password, role: 'admin' }, 200);
    assert.equal(loggedIn.user.role, 'client');
    assert.equal(loggedIn.tokenType, 'Bearer');
    const me = await request('/api/auth/me', undefined, 200, loggedIn.accessToken);
    assert.equal(me.user.id, registered.user.id);
    await request('/api/auth/me', undefined, 401);
    await request('/api/auth/me', undefined, 401, loggedIn.accessToken + 'corrupt');
    const config = jwtConfig();
    const expired = jwt.sign({ version: 0, tokenUse: 'access' }, config.secret,
      { subject: registered.user.id, issuer: config.issuer, audience: config.audience, expiresIn: -1 });
    await request('/api/auth/me', undefined, 401, expired);
    for (const state of [{ isArchived: true, archivedAt: new Date() }, { status: 'inactive' }]) {
      await User.updateOne({ email }, { $set: state });
      assert.deepEqual(await request('/api/auth/login', { email, password: profile.password }, 401), invalid);
      await request('/api/auth/me', undefined, 401, loggedIn.accessToken);
      before = messages.length;
      await request('/api/auth/forgot-password', { email }, 202);
      assert.equal(messages.length, before);
      if (state.isArchived) await request('/api/auth/register', profile, 409);
      await User.updateOne({ email }, { $set: { isArchived: false, archivedAt: null, status: 'active' } });
    }
    passed('unified login, current-user profile, invalid/expired JWT and archived/inactive account rejection');

    stage = 'password recovery';
    const unknown = await request('/api/auth/forgot-password', { email: 'unknown@example.invalid' }, 202);
    const known = await request('/api/auth/forgot-password', { email }, 202);
    assert.deepEqual(known, unknown);
    let reset = latest('password_reset');
    await request('/api/auth/verify-email', { email, otp: reset.code }, 400);
    await request('/api/auth/verify-reset-otp', { email, otp: wrong(reset.code) }, 400);
    assert.equal((await EmailOtp.findById(reset.id)).attempts, 1);
    await EmailOtp.updateOne({ _id: reset.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await request('/api/auth/verify-reset-otp', { email, otp: reset.code }, 400);
    await allowResend('password_reset');
    await request('/api/auth/forgot-password', { email }, 202);
    const oldReset = reset;
    reset = latest('password_reset');
    await request('/api/auth/verify-reset-otp', { email, otp: oldReset.code }, 400);
    let grant = await request('/api/auth/verify-reset-otp', { email, otp: reset.code }, 200);
    assert.match(grant.resetToken, /^[a-f0-9]{64}$/);
    record = await EmailOtp.findById(reset.id).select('+resetTokenHash');
    assert.equal(record.isUsed, true);
    assert.notEqual(record.resetTokenHash, grant.resetToken);
    await request('/api/auth/verify-reset-otp', { email, otp: reset.code }, 400);
    await request('/api/auth/me', undefined, 401, grant.resetToken);
    await request('/api/auth/reset-password', { email, newPassword }, 400);
    await request('/api/auth/reset-password', { email, newPassword, resetToken: 'a'.repeat(64) }, 400);
    const resetResponses = await Promise.all(Array.from({ length: 2 }, async () => {
      const response = await fetch(baseURL + '/api/auth/reset-password', { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, resetToken: grant.resetToken, newPassword, confirmPassword: newPassword }) });
      return response.status;
    }));
    assert.deepEqual(resetResponses.sort(), [200, 400]);
    await request('/api/auth/login', { email, password: profile.password }, 401);
    const newLogin = await request('/api/auth/login', { email, password: newPassword }, 200);
    await request('/api/auth/me', undefined, 401, loggedIn.accessToken);
    await request('/api/auth/me', undefined, 200, newLogin.accessToken);
    await request('/api/auth/reset-password', { email, newPassword, resetToken: grant.resetToken }, 400);
    await request('/api/auth/verify-reset-otp', { email, otp: reset.code }, 400);
    user = await User.findOne({ email }).select('+password');
    assert.ok(await bcrypt.compare(newPassword, user.password));
    passed('reset requires OTP-derived grant; concurrent/replayed use fails; old password and access token revoked');

    stage = 'reset grant expiration and resend invalidation';
    await allowResend('password_reset');
    await request('/api/auth/forgot-password', { email }, 202);
    reset = latest('password_reset');
    grant = await request('/api/auth/verify-reset-otp', { email, otp: reset.code }, 200);
    await allowResend('password_reset');
    await request('/api/auth/forgot-password', { email }, 202);
    await request('/api/auth/reset-password', { email, newPassword, resetToken: grant.resetToken }, 400);
    reset = latest('password_reset');
    grant = await request('/api/auth/verify-reset-otp', { email, otp: reset.code }, 200);
    await EmailOtp.updateOne({ _id: reset.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await request('/api/auth/reset-password', { email, newPassword, resetToken: grant.resetToken }, 400);
    passed('new reset OTP invalidates previous reset grants; expired grants cannot change passwords');

    stage = 'admin bootstrap and staff login/RBAC';
    const admin = await createInitialAdmin({ ...profile, email: 'admin@example.invalid' });
    assert.equal(admin.role, 'admin');
    await assert.rejects(createInitialAdmin({ ...profile, email: 'otheradmin@example.invalid' }), { status: 409 });
    const mechanic = await User.create({ fullName: 'Temporary Mechanic', email: 'mechanic@example.invalid',
      password: await bcrypt.hash(profile.password, 12), role: 'mechanic', employeeId: 'TEST-MECH' });
    for (const account of [admin, mechanic]) {
      const login = await request('/api/auth/login', { email: account.email, password: profile.password }, 200);
      assert.equal(login.user.role, account.role);
      const current = await request('/api/auth/me', undefined, 200, login.accessToken);
      let error;
      authorize('admin', 'mechanic')({ user: current.user }, {}, value => { error = value; });
      assert.equal(error, undefined);
      authorize('client')({ user: current.user }, {}, value => { error = value; });
      assert.equal(error.status, 403);
    }
    passed('explicit admin bootstrap refuses repeat use; one login supports all three roles and RBAC');

    stage = 'mail failures and missing configuration';
    emailService.sendOtp = async () => { throw new Error('Private simulated SMTP failure'); };
    const failure = await request('/api/auth/register', { ...profile, email: 'mailfail@example.invalid' }, 503);
    assert.ok(!failure.message.includes('Private'));
    assert.equal((await User.findOne({ email: 'mailfail@example.invalid' })).emailVerified, false);
    assert.equal(await EmailOtp.countDocuments({ email: 'mailfail@example.invalid', isUsed: false }), 0);
    await allowResend('password_reset');
    assert.deepEqual(await request('/api/auth/forgot-password', { email }, 202), unknown);
    emailService.sendOtp = intercept;
    emailService.ensureConfigured = () => { throw new (require('../utils/HttpError'))(503, 'Email delivery is not configured.'); };
    await request('/api/auth/register', { ...profile, email: 'unconfigured@example.invalid' }, 503);
    assert.equal(await User.countDocuments({ email: 'unconfigured@example.invalid' }), 0);
    await request('/api/auth/login', { email, password: newPassword }, 200);
    passed('mail failures expose no internals; missing mail configuration does not block login');

    stage = 'health endpoints';
    assert.equal((await request('/', undefined, 200)).database, 'connected');
    assert.equal((await request('/api/health', undefined, 200)).database, 'connected');
    passed('root and API health remain connected');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    emailService.sendOtp = originalSend;
    emailService.ensureConfigured = originalCheck;
    try {
      if (mongoose.connection.readyState === 1) {
        assert.match(databaseName, /^tac_[a-f0-9]{32}$/);
        assert.equal(mongoose.connection.name, databaseName);
        const collections = await mongoose.connection.db.listCollections().toArray();
        for (const collection of collections) assert.ok(['users', 'emailotps'].includes(collection.name));
        for (const collection of collections) await mongoose.connection.db.dropCollection(collection.name);
        assert.equal((await mongoose.connection.db.listCollections().toArray()).length, 0);
        console.log(`Cleanup verified: ${databaseName} has no temporary collections or records.`);
      }
    } catch (error) {
      console.error(`Cleanup needs review for temporary database ${databaseName}.`);
      throw error;
    } finally { await mongoose.disconnect(); }
  }
  console.log(`Auth integration complete: ${checks} groups passed. No real email sent.`);
}

run().catch(error => {
  console.error(`Auth integration failed during ${stage}: ${error.name} (${error.code || 'no code'}).`);
  if (error.name === 'AssertionError') console.error(error.message);
  process.exitCode = 1;
});
