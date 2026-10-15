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
const toyotaCatalog = require('../services/toyotaCatalogService');
const auth = require('../services/authService');
const { signAccessToken, verifyAccessToken } = require('../services/tokenService');
const { validateForm } = require('../utils/formValidation.mjs');
const id = () => String(new mongoose.Types.ObjectId());
const walkInStaffId = id();
const sentPassword = () => email.sendEmail.mock.calls.at(-1).arguments[0].text.split('Temporary Password\n')[1].split('\n')[0];
const input = () => ({ customer: { firstName: 'Juan', middleName: '', lastName: 'Santos', suffix: '', email: 'JUAN@example.invalid', phone: '09171234567' },
  vehicle: { make: 'Toyota', model: 'Vios', year: 2025, variant: '1.3 XLE CVT', plateNumber: 'ABC1234', transmission: 'cvt', currentMileage: 0 }, services: [id()], schedule: id() });

beforeEach(t => {
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-only-polish-b-secret-with-more-than-thirty-two-bytes';
  t.after(() => { if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret; });
  t.mock.method(nodemailer, 'createTransport', () => { throw new Error('Live email is forbidden'); });
  t.mock.method(email, 'ensureConfigured', () => {});
  t.mock.method(email, 'sendEmail', async () => {});
});

function fixture(t, { full = false, failBooking = false, failVehicle = false, retry = false } = {}) {
  t.mock.method(toyotaCatalog, 'validateSelection', async () => ({ _id: id() }));
  let state = { users: [], vehicles: [], bookings: [], capacity: 0 };
  let activeSession;
  let attempts = 0;
  t.mock.method(mongoose.connection, 'transaction', async callback => {
    const original = structuredClone(state);
    async function run() {
      activeSession = {}; attempts++;
      try { return await callback(activeSession); }
      catch (error) { state = structuredClone(original); throw error; }
    }
    if (retry) { await run(); state = structuredClone(original); }
    const result = await run(); return result;
  });
  const sessionCheck = options => assert.equal(options.session, activeSession);
  t.mock.method(User, 'exists', query => query.$or ? Promise.resolve(false) : { session: async session => {
    assert.equal(session, activeSession); return state.users.find(user => String(user._id) === String(query._id));
  } });
  t.mock.method(User, 'findOne', filter => {
    const match = state.users.find(user => Object.entries(filter).every(([key, value]) => String(user[key]) === String(value))) || null;
    const query = { select: () => query, session: session => { assert.equal(session, activeSession); return query; }, then: (resolve, reject) => Promise.resolve(match).then(resolve, reject) };
    return query;
  });
  t.mock.method(User, 'findOneAndUpdate', (filter, update, options) => {
    sessionCheck(options);
    const user = state.users.find(user => String(user._id) === String(filter._id) && user.isWalkInCustomer);
    if (user) { Object.assign(user, update.$set); for (const key of Object.keys(update.$unset || {})) delete user[key]; user.authVersion = (user.authVersion || 0) + (update.$inc?.authVersion || 0); }
    return { select: async () => user || null };
  });
  t.mock.method(Vehicle, 'exists', query => query.plateNumber ? Promise.resolve(false) : { session: async session => {
    assert.equal(session, activeSession); return state.vehicles.find(vehicle => String(vehicle._id) === String(query._id) && String(vehicle.owner) === String(query.owner));
  } });
  t.mock.method(Vehicle, 'updateOne', (_filter, _update, options) => { sessionCheck(options); return { matchedCount: 1 }; });
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
  t.mock.method(Booking, 'find', () => ({ select: () => ({ session: session => ({ lean: async () => {
    assert.equal(session, activeSession); return [];
  } }) }) }));
  t.mock.method(engagement, 'recordBookingEvent', async session => assert.equal(session, activeSession));
  t.mock.method(Booking, 'findOne', () => ({ populate: () => ({ lean: async () => state.bookings[0] }) }));
  return { state: () => state, attempts: () => attempts };
}

test('new emailed Walk-In atomically creates a forced-setup Client, vehicle, and checked-in booking', async t => {
  const f = fixture(t, { retry: true });
  const body = input(); body.customer.role = 'admin'; body.customer.mustChangePassword = false;
  const result = await walkIn.create(body, walkInStaffId);
  assert.equal(f.attempts(), 2);
  const state = f.state(); const user = state.users[0];
  assert.equal(state.users.length, 1); assert.equal(state.vehicles.length, 1); assert.equal(state.bookings.length, 1); assert.equal(state.capacity, 1);
  assert.equal(user.role, 'client'); assert.equal(user.status, 'active'); assert.equal(user.isWalkInCustomer, false); assert.equal(user.emailVerified, true);
  assert.equal(user.fullName, 'Juan Santos'); assert.equal(user.email, 'juan@example.invalid'); assert.equal(user.phone, '+639171234567');
  assert.equal(user.contactEmail, undefined); assert.equal(user.mustChangePassword, true);
  assert.equal(result.accountCreated, true); assert.equal(result.emailSent, true);
  const secret = sentPassword();
  assert.equal(result.credentials, undefined);
  assert.equal(JSON.stringify(result).includes(secret), false, 'Staff response never contains the plaintext credential');
  assert.equal(result.account.email, user.email); assert.ok(result.deliveryToken);
  assert.equal(require('../../shared/accountValidation.mjs').passwordError(secret), '');
  assert.ok(await bcrypt.compare(secret, user.password)); assert.equal(bcrypt.getRounds(user.password), 12);
  assert.notEqual(user.password, secret); assert.equal(result.item.password, undefined);
  assert.equal(email.sendEmail.mock.calls.length, 1, 'transaction retries never email rolled-back credentials');
  assert.ok(email.sendEmail.mock.calls[0].arguments[0].text.includes(secret));
  assert.equal(result.item.bookingType, 'walk-in'); assert.equal(result.item.status, 'checked_in');
});

for (const failure of ['full', 'failBooking', 'failVehicle']) test(`${failure}: aborts customer, vehicle, booking and capacity`, async t => {
  const f = fixture(t, { [failure]: true });
  await assert.rejects(walkIn.create(input(), walkInStaffId));
  assert.deepEqual(f.state(), { users: [], vehicles: [], bookings: [], capacity: 0 });
});

test('walk-in booking succeeds without email or email transport', async t => {
  const f = fixture(t); const body = input(); body.customer.email = '';
  t.mock.method(email, 'ensureConfigured', () => { throw new Error('SMTP unavailable'); });
  const result = await walkIn.create(body, walkInStaffId);
  assert.equal(f.state().bookings.length, 1);
  assert.equal(f.state().users[0].contactEmail, undefined);
  assert.equal(f.state().users[0].password, undefined);
  assert.equal(f.state().users[0].isWalkInCustomer, true);
  assert.equal(result.credentials, undefined); assert.equal(result.accountCreated, false);
  assert.equal(email.sendEmail.mock.calls.length, 0);
  assert.equal(result.item.status, 'checked_in');
});

test('invalid walk-in customer or vehicle data creates no records', async t => {
  const f = fixture(t);
  const changes = [
    body => { body.customer.firstName = '' },
    body => { body.customer.phone = '123' },
    body => { body.customer.email = 'invalid-address' },
    body => { body.vehicle.model = '' },
    body => { body.vehicle.plateNumber = '!' },
  ];
  for (const change of changes) {
    const body = input(); change(body);
    await assert.rejects(walkIn.create(body, walkInStaffId), { status: 400 });
  }
  assert.equal(f.attempts(), 0);
  assert.deepEqual(f.state(), { users: [], vehicles: [], bookings: [], capacity: 0 });
});

test('walk-in records need no password, while online Client accounts still do', async () => {
  const base = { fullName: 'Walk In', email: `walkin-${id()}@no-login.toyota-autocare.invalid`, role: 'client' };
  await new User({ ...base, isWalkInCustomer: true }).validate();
  await assert.rejects(new User({ ...base, email: 'online@example.invalid' }).validate(), error => Boolean(error.errors.password));
  assert.ok(User.schema.indexes().some(([fields, options]) => fields.contactEmail === 1 && options.unique));
});

test('an existing normalized Client email links to its account without credentials or account changes', async t => {
  const f = fixture(t);
  const existing = { _id: id(), role: 'client', fullName: 'Existing Person', status: 'active', isArchived: false,
    email: 'juan@example.invalid', isWalkInCustomer: false, password: 'existing-hash', mustChangePassword: false, emailVerified: false };
  f.state().users.push(existing); const before = { ...existing };
  assert.equal((await walkIn.checkEmail(' JUAN@Example.invalid ')).message, 'Existing client account found.');
  const result = await walkIn.create(input(), walkInStaffId);
  assert.deepEqual(f.state().users, [before]); assert.equal(f.state().vehicles[0].owner, existing._id);
  assert.equal(f.state().bookings[0].client, existing._id);
  assert.equal(result.existingClient, true); assert.equal(result.credentials, undefined);
  assert.equal(email.sendEmail.mock.calls.length, 0);
});

test('a matched legacy offline contact is upgraded in place instead of duplicated', async t => {
  const f = fixture(t); const existing = { _id: id(), role: 'client', status: 'active', isArchived: false,
    fullName: 'Original Customer', email: 'legacy@no-login.toyota-autocare.invalid', contactEmail: 'juan@example.invalid', isWalkInCustomer: true };
  f.state().users.push(existing);
  const result = await walkIn.create(input(), walkInStaffId);
  assert.equal(f.state().users.length, 1); assert.equal(f.state().users[0]._id, existing._id);
  assert.equal(f.state().users[0].isWalkInCustomer, false); assert.equal(f.state().users[0].contactEmail, undefined);
  assert.equal(f.state().users[0].fullName, 'Original Customer'); assert.equal(result.accountCreated, true);
  assert.ok(await bcrypt.compare(sentPassword(), f.state().users[0].password));
});

test('unique email races retry against the committed Client and never return losing credentials', async t => {
  const f = fixture(t); let attempts = 0;
  t.mock.method(User, 'findOne', filter => {
    const match = attempts && filter.email === 'juan@example.invalid' ? { _id: id(), fullName: 'Concurrent Client', email: filter.email, role: 'client', status: 'active', isArchived: false, isWalkInCustomer: false } : null;
    const query = { select: () => query, session: () => query, then: (resolve, reject) => Promise.resolve(match).then(resolve, reject) }; return query;
  });
  t.mock.method(User, 'create', async () => { attempts++; throw { code: 11000, keyPattern: { email: 1 } }; });
  t.mock.method(User, 'exists', () => ({ session: async () => true }));
  const result = await walkIn.create(input(), walkInStaffId);
  assert.equal(f.attempts(), 2); assert.equal(result.credentials, undefined); assert.equal(result.accountCreated, false);
  assert.equal(email.sendEmail.mock.calls.length, 0);
});

test('inactive, archived or non-client email owners are not changed or linked', async t => {
  const f = fixture(t);
  for (const change of [{ status: 'inactive' }, { isArchived: true }, { role: 'staff' }]) {
    f.state().users = [{ _id: id(), email: 'juan@example.invalid', role: 'client', status: 'active', isArchived: false, ...change }];
    await assert.rejects(walkIn.create(input(), walkInStaffId), { status: 409 });
    assert.equal(f.state().vehicles.length, 0);
  }
});

test('email failure keeps the created visit and reports failure without exposing the credential', async t => {
  const f = fixture(t); t.mock.method(email, 'sendEmail', async () => { throw new Error('SMTP unavailable'); });
  const result = await walkIn.create(input(), walkInStaffId);
  assert.equal(f.state().bookings.length, 1); assert.equal(result.emailSent, false);
  assert.equal(result.accountCreated, true); assert.ok(sentPassword());
  assert.equal(result.credentials, undefined); assert.ok(result.deliveryToken);
  assert.match(result.message, /could not be delivered/);
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

test('HTTP: forced mechanics cannot use protected APIs; new Walk-In is Staff-only', async t => {
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
  assert.equal((await request('/bookings/walk-in/email-check?email=client@example.invalid')).status, 403);
  user.role = 'admin'; assert.equal((await request('/bookings/walk-in/new-client', {})).status, 403);
  user.role = 'staff'; assert.equal((await request('/bookings/walk-in/new-client', {})).status, 400);
  const oldToken = signAccessToken(user); user.authVersion = 1;
  assert.equal((await request('/auth/me', undefined, oldToken)).status, 401);
});

test('a provisioned walk-in Client must change its temporary password before protected APIs, and the old password stops working', async t => {
  const f = fixture(t);
  const created = await walkIn.create(input(), walkInStaffId);
  const user = f.state().users[0];
  t.mock.method(User, 'findById', () => ({ select: async () => user }));
  t.mock.method(User, 'findOneAndUpdate', (filter, update) => ({ select: async () => {
    assert.equal(filter.mustChangePassword, true); assert.equal(filter.password, user.password);
    Object.assign(user, update.$set); user.authVersion = (user.authVersion || 0) + update.$inc.authVersion;
    return user;
  } }));
  const ready = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
  Object.defineProperty(mongoose.connection, 'readyState', { configurable: true, value: 1 });
  t.after(() => ready ? Object.defineProperty(mongoose.connection, 'readyState', ready) : delete mongoose.connection.readyState);
  const server = require('../app').listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, body, token) => fetch(origin + path, { method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const login = await request('/auth/login', { email: user.email, password: sentPassword() });
  assert.equal(login.status, 200); const session = await login.json();
  assert.equal(session.user.mustChangePassword, true); assert.equal(session.user.password, undefined);
  for (const path of ['/vehicles', '/bookings', '/bookings/options', '/maintenance-reminders'])
    assert.equal((await request(path, undefined, session.accessToken)).status, 403);
  const changed = await request('/auth/change-temporary-password', { newPassword: 'Client New Journey 42!', confirmPassword: 'Client New Journey 42!' }, session.accessToken);
  assert.equal(changed.status, 200); const updated = await changed.json();
  assert.equal(updated.user.mustChangePassword, false); assert.equal(updated.user.role, 'client');
  assert.equal((await request('/auth/me', undefined, updated.accessToken)).status, 200);
  assert.equal((await request('/auth/me', undefined, session.accessToken)).status, 401);
  assert.equal((await request('/auth/login', { email: user.email, password: sentPassword() })).status, 401);
  assert.equal((await request('/auth/login', { email: user.email, password: 'Client New Journey 42!' })).status, 200);
});

