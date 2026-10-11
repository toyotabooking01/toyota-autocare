const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const Booking = require('../models/Booking');
const Service = require('../models/Service');
const Schedule = require('../models/Schedule');
const email = require('../services/emailService');
const engagement = require('../services/engagementService');
const resourceAvailability = require('../services/resourceAvailabilityService');
const walkIn = require('../services/newWalkInService');
const auth = require('../services/authService');
const { signAccessToken, verifyAccessToken } = require('../services/tokenService');
const { passwordError } = require('../../shared/accountValidation.mjs');
const { validateForm } = require('../utils/formValidation.mjs');
const id = () => String(new mongoose.Types.ObjectId());
const input = () => ({ customer: { firstName: 'Juan', middleName: '', lastName: 'Santos', suffix: '', email: 'JUAN@example.invalid', phone: '09171234567' },
  vehicle: { make: 'Toyota', model: 'Vios', year: 2024, plateNumber: 'ABC1234', transmission: 'automatic', currentMileage: 0 }, services: [id()], schedule: id() });

beforeEach(t => {
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-only-polish-b-secret-with-more-than-thirty-two-bytes';
  t.after(() => { if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret; });
  t.mock.method(nodemailer, 'createTransport', () => { throw new Error('Live email is forbidden'); });
  t.mock.method(email, 'ensureConfigured', () => {});
  t.mock.method(email, 'sendEmail', async () => {});
});

function fixture(t, { full = false, failBooking = false, failVehicle = false, retry = false, failEmail = false } = {}) {
  let state = { users: [], vehicles: [], bookings: [], capacity: 0 };
  let activeSession;
  let committed = false;
  let attempts = 0;
  const delivered = [];
  t.mock.method(mongoose.connection, 'transaction', async callback => {
    const original = structuredClone(state);
    async function run() {
      activeSession = {}; attempts++;
      try { return await callback(activeSession); }
      catch (error) { state = structuredClone(original); throw error; }
    }
    if (retry) { await run(); state = structuredClone(original); }
    const result = await run(); committed = true; return result;
  });
  const sessionCheck = options => assert.equal(options.session, activeSession);
  t.mock.method(User, 'exists', query => query.email ? Promise.resolve(false) : { session: async session => {
    assert.equal(session, activeSession); return state.users.find(user => String(user._id) === String(query._id));
  } });
  t.mock.method(Vehicle, 'exists', query => query.plateNumber ? Promise.resolve(false) : { session: async session => {
    assert.equal(session, activeSession); return state.vehicles.find(vehicle => String(vehicle._id) === String(query._id) && String(vehicle.owner) === String(query.owner));
  } });
  t.mock.method(User, 'create', async ([record], options) => { sessionCheck(options); const user = { ...record, _id: id() }; state.users.push(user); return [user]; });
  t.mock.method(Vehicle, 'create', async ([record], options) => { sessionCheck(options); if (failVehicle) throw new Error('vehicle failure'); state.vehicles.push(record); return [record]; });
  t.mock.method(Service, 'find', () => ({ select: () => ({ session: session => ({ lean: async () => {
    assert.equal(session, activeSession); return [{ _id: id(), estimatedDuration: 60 }];
  } }) }) }));
  t.mock.method(resourceAvailability, 'canFitBooking', async (_period, options) => { assert.equal(options.session, activeSession); return { available: true }; });
  t.mock.method(Schedule, 'findById', () => ({ session: session => {
    assert.equal(session, activeSession); return { lean: async () => ({ date: '2099-05-12', timeSlot: '09:00', isEnabled: true }) };
  } }));
  t.mock.method(Schedule, 'findOneAndUpdate', async (filter, update, options) => {
    sessionCheck(options); assert.deepEqual(filter.$expr.$lt, ['$currentBookingCount', '$maximumCapacity']);
    if (full) return null;
    state.capacity += update.$inc.currentBookingCount; return { date: '2099-05-12', timeSlot: '09:00' };
  });
  t.mock.method(Booking, 'create', async ([record], options) => {
    sessionCheck(options); if (failBooking) throw new Error('booking failure');
    const booking = { ...record, _id: id() }; state.bookings.push(booking); return [booking];
  });
  t.mock.method(engagement, 'recordBookingEvent', async session => assert.equal(session, activeSession));
  t.mock.method(Booking, 'findOne', () => ({ populate: () => ({ lean: async () => state.bookings[0] }) }));
  t.mock.method(email, 'sendEmail', async message => {
    assert.equal(committed, true); delivered.push(message);
    if (failEmail) throw new Error('SMTP private technical error');
  });
  return { state: () => state, delivered, attempts: () => attempts };
}

test('new Walk-In commits together, preserves capacity query, hashes secret and emails only after commit/retries', async t => {
  const f = fixture(t, { retry: true });
  const body = input(); body.customer.role = 'admin'; body.customer.mustChangePassword = false;
  const result = await walkIn.create(body);
  assert.equal(f.attempts(), 2); assert.equal(f.delivered.length, 1);
  const state = f.state(); const user = state.users[0];
  assert.equal(state.users.length, 1); assert.equal(state.vehicles.length, 1); assert.equal(state.bookings.length, 1); assert.equal(state.capacity, 1);
  assert.equal(user.role, 'client'); assert.equal(user.mustChangePassword, true); assert.equal(user.termsAcceptedAt, undefined);
  assert.equal(user.fullName, 'Juan Santos'); assert.equal(user.email, 'juan@example.invalid'); assert.equal(user.phone, '+639171234567');
  const secret = /Temporary Password\n(\S+)/.exec(f.delivered[0].text)[1];
  assert.equal(passwordError(secret), ''); assert.ok(await bcrypt.compare(secret, user.password));
  assert.ok(!JSON.stringify(result).includes(secret)); assert.ok(!JSON.stringify(result).includes(user.password));
  assert.equal(result.item.bookingType, 'walk-in'); assert.equal(result.item.status, 'confirmed'); assert.equal(result.emailSent, true);
});

for (const failure of ['full', 'failBooking', 'failVehicle']) test(`${failure}: aborts account, vehicle, booking and capacity; no email`, async t => {
  const f = fixture(t, { [failure]: true });
  await assert.rejects(walkIn.create(input()));
  assert.deepEqual(f.state(), { users: [], vehicles: [], bookings: [], capacity: 0 }); assert.equal(f.delivered.length, 0);
});

test('delivery failure preserves committed booking and returns a friendly warning without secret or SMTP error', async t => {
  const f = fixture(t, { failEmail: true }); const result = await walkIn.create(input());
  assert.equal(result.emailSent, false); assert.equal(f.state().bookings.length, 1);
  assert.match(result.message, /Do not create another booking/); assert.doesNotMatch(JSON.stringify(result), /SMTP|technical|Aa1!/);
});

test('duplicate email precheck and unique-index race both direct Admin to Existing Client', async t => {
  const f = fixture(t);
  const exists = t.mock.method(User, 'exists', async () => true);
  await assert.rejects(walkIn.create(input()), error => error.status === 409 && /Existing Client/.test(error.errors.email));
  assert.equal(f.attempts(), 0); exists.mock.restore();
  t.mock.method(User, 'create', async () => { throw { code: 11000, keyPattern: { email: 1 } }; });
  await assert.rejects(walkIn.create(input()), error => error.status === 409 && /Existing Client/.test(error.errors.email));
  assert.equal(f.delivered.length, 0);
});

test('unconfigured email prevents database writes', async t => {
  const f = fixture(t); t.mock.method(email, 'ensureConfigured', () => { throw new Error('private configuration'); });
  await assert.rejects(walkIn.create(input()), error => error.status === 503 && /No booking was created/.test(error.message));
  assert.equal(f.attempts(), 0); assert.equal(f.delivered.length, 0);
});

test('new-client name and mobile validation matches browser rules', async () => {
  const { validateForm: browser } = await import('../../client/src/utils/validationRules.js');
  for (const change of [{}, { firstName: ' ' }, { middleName: '', suffix: '' }, { suffix: 'invalid' }, { phone: '0917abc4567' }, { phone: '+639171234567' }, { email: 'bad' }]) {
    const values = { ...input().customer, ...change };
    assert.deepEqual(validateForm('walkInClient', values), browser('walkInClient', values));
  }
});

test('mechanic temporary password change rejects weak/mismatched/reused passwords, clears flag and invalidates old tokens', async t => {
  const oldPassword = 'TemporaryJourney42!';
  let user = { _id: id(), role: 'mechanic', status: 'active', isArchived: false, emailVerified: true, mustChangePassword: true,
    authVersion: 0, password: await bcrypt.hash(oldPassword, 4) };
  t.mock.method(User, 'findById', () => ({ select: async () => user }));
  t.mock.method(User, 'findOneAndUpdate', (filter, update) => ({ select: async () => {
    assert.equal(filter.mustChangePassword, true); assert.equal(filter.password, user.password); assert.equal(filter.authVersion, 0);
    assert.deepEqual(Object.keys(update.$set).sort(), ['mustChangePassword', 'password']);
    assert.equal(Object.hasOwn(update.$set, 'role'), false);
    user = { ...user, ...update.$set, authVersion: user.authVersion + update.$inc.authVersion }; return user;
  } }));
  for (const values of [{ newPassword: 'short', confirmPassword: 'short' }, { newPassword: 'SecureJourney42!', confirmPassword: 'different' }, { newPassword: oldPassword, confirmPassword: oldPassword }]) {
    await assert.rejects(auth.changeTemporaryPassword(user, values), { status: 400 });
    assert.equal(user.mustChangePassword, true);
  }
  const result = await auth.changeTemporaryPassword(user, { newPassword: 'SecureJourney42!', confirmPassword: 'SecureJourney42!' });
  const payload = verifyAccessToken(result.accessToken);
  assert.equal(result.user.role, 'mechanic'); assert.equal(user.role, 'mechanic');
  assert.equal(payload.role, 'mechanic'); assert.equal(payload.version, 1);
  assert.equal(result.user.mustChangePassword, false);
  assert.ok(await bcrypt.compare('SecureJourney42!', user.password)); assert.equal(result.user.password, undefined);
  await assert.rejects(auth.changeTemporaryPassword(user, { newPassword: 'SecureJourney42!', confirmPassword: 'SecureJourney42!' }), { status: 409 });
  for (const role of ['client', 'admin']) {
    user = { _id: id(), role, status: 'active', isArchived: false, emailVerified: true, mustChangePassword: true,
      authVersion: 0, password: await bcrypt.hash(oldPassword, 4) };
    const account = { ...user };
    const changed = await auth.changeTemporaryPassword(account, {
      newPassword: 'SecureJourney42!', confirmPassword: 'SecureJourney42!',
    });
    assert.equal(user.role, role);
    assert.equal(changed.user.role, role);
    assert.equal(verifyAccessToken(changed.accessToken).role, role);
  }
});

test('password change rejects a missing role instead of assigning a default role', async t => {
  const user = { _id: id(), status: 'active', isArchived: false, mustChangePassword: true, authVersion: 0 };
  t.mock.method(User, 'findById', () => ({ select: async () => user }));
  await assert.rejects(auth.changeTemporaryPassword(user, {
    newPassword: 'SecureJourney42!', confirmPassword: 'SecureJourney42!',
  }), error => error.status === 401);
  assert.equal(Object.hasOwn(user, 'role'), false);
  assert.throws(() => signAccessToken(user));
});

test('HTTP: forced mechanics can log in/read session but cannot use protected APIs; new Walk-In remains Admin-only', async t => {
  const user = { _id: id(), role: 'mechanic', email: 'mechanic@example.invalid', status: 'active', isArchived: false,
    emailVerified: true, mustChangePassword: true, authVersion: 0, password: await bcrypt.hash('TemporaryJourney42!', 4) };
  t.mock.method(User, 'findById', () => ({ select: async () => user }));
  t.mock.method(User, 'findOne', () => ({ select: async () => user }));
  const descriptor = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
  Object.defineProperty(mongoose.connection, 'readyState', { configurable: true, value: 1 });
  t.after(() => descriptor ? Object.defineProperty(mongoose.connection, 'readyState', descriptor) : delete mongoose.connection.readyState);
  const app = require('../app'); const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, body, token = signAccessToken(user)) => fetch(origin + path, { method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const login = await request('/auth/login', { email: user.email, password: 'TemporaryJourney42!' });
  assert.equal(login.status, 200); assert.equal((await login.json()).user.mustChangePassword, true);
  assert.equal((await request('/auth/me')).status, 200);
  assert.equal((await request('/job-orders')).status, 403);
  assert.equal((await request('/mechanics')).status, 403);
  for (const path of ['/bookings', '/vehicles', '/notifications', '/maintenance-reminders', '/bookings/options']) assert.equal((await request(path)).status, 403);
  assert.equal((await request('/auth/change-temporary-password', { newPassword: 'short', confirmPassword: 'short' })).status, 400);
  user.mustChangePassword = false;
  assert.equal((await request('/bookings/walk-in/new-client', input())).status, 403);
  user.role = 'client';
  assert.equal((await request('/bookings/walk-in/new-client', input())).status, 403);
  user.role = 'admin'; assert.equal((await request('/bookings/walk-in/new-client', {})).status, 400);
  const oldToken = signAccessToken(user); user.authVersion = 1;
  assert.equal((await request('/auth/me', undefined, oldToken)).status, 401);
});

