const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const Counter = require('../models/Counter');
const Booking = require('../models/Booking');
const app = require('../app');
const emailService = require('../services/emailService');
const staffAccounts = require('../services/staffAccountService');
const engagement = require('../services/engagementService');
const { signAccessToken } = require('../services/tokenService');

const input = { firstName: 'Maria', lastName: 'Santos', email: 'maria@example.invalid',
  phone: '09171234567' };

test('Staff input requires contact fields and rejects password, role, or Staff ID overrides', () => {
  assert.equal(staffAccounts.input(input).phone, '+639171234567');
  for (const field of Object.keys(input)) {
    const missing = { ...input }; delete missing[field];
    assert.throws(() => staffAccounts.input(missing), { status: 400 });
  }
  assert.throws(() => staffAccounts.input({ ...input, password: 'injected' }), { status: 400 });
  assert.throws(() => staffAccounts.input({ ...input, role: 'admin' }), { status: 400 });
  assert.throws(() => staffAccounts.input({ ...input, staffId: 'STF-9999' }), { status: 400 });
  assert.ok(User.schema.indexes().some(([keys, options]) => keys.staffId === 1 && options.unique));
});

test('Admin creates Staff, emailed temporary credential forces setup, then only new password logs in', async t => {
  t.mock.method(engagement, 'recordAccountEvent', async () => {});
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-only-staff-flow-secret-longer-than-thirty-two-bytes';
  t.after(() => { if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret; });
  const ready = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
  Object.defineProperty(mongoose.connection, 'readyState', { configurable: true, value: 1 });
  t.after(() => ready ? Object.defineProperty(mongoose.connection, 'readyState', ready) : delete mongoose.connection.readyState);

  const admin = new User({ _id: new mongoose.Types.ObjectId(), fullName: 'Admin', email: 'admin@example.invalid',
    password: await bcrypt.hash('Admin secure password 42!', 4), role: 'admin', emailVerified: true });
  let staff;
  const deliveries = [];
  t.mock.method(User, 'exists', async () => false);
  let sequence = 0;
  t.mock.method(Counter, 'findById', () => ({ lean: async () => sequence ? { sequence } : null }));
  t.mock.method(Counter, 'findOneAndUpdate', async () => ({ sequence: ++sequence }));
  t.mock.method(User, 'create', async values => { staff = new User(values); await staff.validate(); return staff; });
  t.mock.method(User, 'findById', id => ({ select: async () => String(id) === String(admin._id) ? admin : String(id) === String(staff?._id) ? staff : null }));
  t.mock.method(User, 'findOne', filter => ({ select: async () => filter.email === staff?.email ? staff : null }));
  t.mock.method(User, 'findOneAndUpdate', (filter, update) => ({ select: async () => {
    assert.equal(String(filter._id), String(staff._id));
    assert.equal(filter.password, staff.password);
    Object.assign(staff, update.$set);
    staff.authVersion += update.$inc.authVersion;
    return staff;
  } }));
  t.mock.method(User, 'find', filter => {
    if (filter.role === 'client') return { select: () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) }) };
    assert.equal(filter.role, 'staff');
    return { select: fields => {
      assert.ok(fields.includes('staffId'));
      assert.ok(!fields.includes('password'));
      return { sort: () => ({ lean: async () => [{ _id: staff._id, firstName: staff.firstName,
        lastName: staff.lastName, fullName: staff.fullName, staffId: staff.staffId, email: staff.email,
        phone: staff.phone, status: staff.status }] }) };
    } };
  });
  t.mock.method(Booking, 'aggregate', async () => []);
  t.mock.method(emailService, 'ensureConfigured', () => {});
  t.mock.method(emailService, 'sendTemporaryPassword', async details => { deliveries.push(details); });

  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function request(path, { method = 'GET', token, body } = {}) {
    const response = await fetch(`${origin}/api${path}`, { method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  }
  const adminToken = signAccessToken(admin);
  const preview = await request('/people/staff/next-id', { token: adminToken });
  assert.equal(preview.status, 200);
  assert.equal(preview.data.staffId, 'STF-0001');
  assert.equal((await request('/people/staff/next-id')).status, 401);
  const created = await request('/people/staff', { method: 'POST', token: adminToken, body: input });
  assert.equal(created.status, 201);
  assert.equal(created.data.emailSent, true);
  assert.equal(created.data.item.staffId, 'STF-0001');
  assert.equal(staff.role, 'staff'); assert.equal(staff.status, 'active');
  assert.equal(staff.mustChangePassword, true);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].accountType, 'staff');
  assert.equal(deliveries[0].staffId, 'STF-0001');
  const temporary = deliveries[0].password;
  assert.ok(temporary.length >= 12 && /[A-Z]/.test(temporary) && /[a-z]/.test(temporary)
    && /\d/.test(temporary) && /[^A-Za-z0-9]/.test(temporary));
  assert.ok(await bcrypt.compare(temporary, staff.password));
  assert.ok(!JSON.stringify(created.data).includes(temporary));
  assert.ok(!JSON.stringify(created.data).includes(staff.password));
  const list = await request('/people/staff', { token: adminToken });
  assert.equal(list.status, 200);
  assert.equal(list.data.items[0].staffId, 'STF-0001');
  assert.equal(list.data.items[0].phone, '+639171234567');
  assert.ok(!JSON.stringify(list.data).includes(temporary));
  assert.ok(!JSON.stringify(list.data).includes(staff.password));

  const login = await request('/auth/login', { method: 'POST', body: { email: input.email, password: temporary } });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.mustChangePassword, true);
  const initialToken = login.data.accessToken;
  assert.equal((await request('/auth/me', { token: initialToken })).status, 200);
  assert.equal((await request('/people/customers', { token: initialToken })).status, 403);
  const newPassword = 'New Staff Journey 42!';
  const changed = await request('/auth/change-temporary-password', { method: 'POST', token: initialToken,
    body: { newPassword, confirmPassword: newPassword } });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.user.mustChangePassword, false);
  assert.notEqual(changed.data.accessToken, initialToken);
  assert.ok(await bcrypt.compare(newPassword, staff.password));
  assert.equal(await bcrypt.compare(temporary, staff.password), false);
  assert.equal((await request('/people/customers', { token: initialToken })).status, 401);
  assert.equal((await request('/people/customers', { token: changed.data.accessToken })).status, 200);
  assert.equal((await request('/auth/login', { method: 'POST', body: { email: input.email, password: temporary } })).status, 401);
  const secondLogin = await request('/auth/login', { method: 'POST', body: { email: input.email, password: newPassword } });
  assert.equal(secondLogin.status, 200);
  assert.equal(secondLogin.data.user.mustChangePassword, false);
  assert.equal((await request('/people/customers', { token: secondLogin.data.accessToken })).status, 200);
});

test('Staff creation reports email failure without leaking the generated credential', async t => {
  t.mock.method(engagement, 'recordAccountEvent', async () => {});
  t.mock.method(User, 'exists', async () => false);
  t.mock.method(Counter, 'findOneAndUpdate', async () => ({ sequence: 1 }));
  t.mock.method(User, 'create', async values => new User(values));
  t.mock.method(emailService, 'ensureConfigured', () => {});
  t.mock.method(emailService, 'sendTemporaryPassword', async () => { throw new Error('private SMTP failure'); });
  const result = await staffAccounts.create(input);
  assert.equal(result.emailSent, false);
  assert.match(result.message, /could not be sent/);
  assert.ok(!JSON.stringify(result).includes('private SMTP failure'));
  assert.ok(!JSON.stringify(result).includes('$2b$'));
});

test('Concurrent Staff creation allocates unique IDs and never reuses one after deletion', async t => {
  t.mock.method(engagement, 'recordAccountEvent', async () => {});
  let sequence = 0;
  const records = new Map();
  t.mock.method(Counter, 'findOneAndUpdate', async (filter, update, options) => {
    assert.deepEqual(filter, { _id: 'staffId' });
    assert.deepEqual(update, { $inc: { sequence: 1 } });
    assert.equal(options.upsert, true);
    assert.equal(options.returnDocument, 'after');
    return { sequence: ++sequence };
  });
  t.mock.method(Counter, 'findById', () => ({ lean: async () => ({ sequence }) }));
  t.mock.method(User, 'exists', async filter => filter.staffId ? records.has(filter.staffId) : false);
  t.mock.method(User, 'create', async values => {
    if (records.has(values.staffId)) throw Object.assign(new Error('duplicate'), { code: 11000, keyPattern: { staffId: 1 } });
    const record = new User(values);
    await record.validate();
    records.set(record.staffId, record);
    return record;
  });
  t.mock.method(emailService, 'ensureConfigured', () => {});
  t.mock.method(emailService, 'sendTemporaryPassword', async () => {});
  const created = await Promise.all([1, 2, 3].map(number => staffAccounts.create({ ...input, email: `staff${number}@example.invalid` })));
  assert.deepEqual(created.map(result => result.item.staffId).sort(), ['STF-0001', 'STF-0002', 'STF-0003']);
  records.delete('STF-0002');
  assert.equal(await staffAccounts.previewNextStaffId(), 'STF-0004');
  const fourth = await staffAccounts.create({ ...input, email: 'staff4@example.invalid' });
  assert.equal(fourth.item.staffId, 'STF-0004');
  assert.equal(sequence, 4);
});

test('Staff ID allocation skips a pre-existing ID and recovers from a first-upsert race', async t => {
  let attempts = 0;
  t.mock.method(Counter, 'findOneAndUpdate', async () => {
    attempts++;
    if (attempts === 1) throw Object.assign(new Error('counter already inserted'), { code: 11000 });
    return { sequence: attempts - 1 };
  });
  t.mock.method(User, 'exists', async filter => filter.staffId === 'STF-0001');
  assert.equal(await staffAccounts.nextStaffId(), 'STF-0002');
  assert.equal(attempts, 3);
});
