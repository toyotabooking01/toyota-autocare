const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const ServiceBay = require('../models/ServiceBay');
const User = require('../models/User');
const master = require('../services/masterDataService');
const { SERVICE_BAY_DUPLICATE } = require('../../shared/serviceBayName.cjs');
const id = () => String(new mongoose.Types.ObjectId());
const duplicate = error => error.status === 409 && error.message === SERVICE_BAY_DUPLICATE && error.errors.name === SERVICE_BAY_DUPLICATE;

test('lookup and model share trimmed uppercase names; archived names also remain reserved', async t => {
  const queries = [];
  t.mock.method(ServiceBay, 'exists', async query => { queries.push(query); return { _id: id() }; });
  for (const name of ['BAY 1', 'Bay 1', 'bay 1', ' BAY 1 ']) {
    assert.deepEqual(await master.bayNameAvailability({ name }), { exists: true });
    assert.deepEqual(queries.at(-1), { name: 'BAY 1' });
    assert.equal(new ServiceBay({ name }).name, 'BAY 1');
  }
  assert.ok(ServiceBay.schema.indexes().some(([keys, options]) => keys.name === 1 && options.unique));
});
test('lookup rejects missing, empty, oversized and object input or invalid edit IDs', async t => {
  const exists = t.mock.method(ServiceBay, 'exists', async () => false);
  for (const query of [{}, { name: ' ' }, { name: 'a'.repeat(81) }, { name: { $ne: '' } }, { name: 'Bay 1', excludeId: 'bad' }]) {
    await assert.rejects(master.bayNameAvailability(query), { status: 400 });
  }
  assert.equal(exists.mock.callCount(), 0);
});
test('edit excludes only itself, permitting same name but rejecting another record', async t => {
  const ownId = id(); const otherId = id(); let otherExists = false;
  t.mock.method(ServiceBay, 'exists', async query => {
    assert.deepEqual(query._id, { $ne: ownId });
    return otherExists ? { _id: otherId } : null;
  });
  let saves = 0;
  const item = { name: 'BAY 1', isArchived: false, save: async () => { saves++; return item; } };
  t.mock.method(ServiceBay, 'findById', async () => item);
  assert.deepEqual(await master.bayNameAvailability({ name: ' bay 1 ', excludeId: ownId }), { exists: false });
  await master.update('bay', ownId, { name: ' bay 1 ' });
  assert.equal(item.name, 'BAY 1'); assert.equal(saves, 1);
  otherExists = true;
  await assert.rejects(master.update('bay', ownId, { name: 'Bay 2' }), duplicate);
  assert.equal(saves, 1); assert.equal(item.name, 'BAY 1');
});
test('bypassed frontend duplicates fail before writing; create and update races return friendly errors', async t => {
  let exists = true;
  t.mock.method(ServiceBay, 'exists', async () => exists);
  const write = t.mock.method(ServiceBay, 'create', async data => {
    assert.equal(data.name, 'BAY 1'); throw { code: 11000, message: 'MongoDB private index details' };
  });
  await assert.rejects(master.create('bay', { name: 'bay 1' }), duplicate); assert.equal(write.mock.callCount(), 0);
  exists = false;
  await assert.rejects(master.create('bay', { name: ' bay 1 ' }), duplicate);
  t.mock.method(ServiceBay, 'findById', async () => ({ isArchived: false, name: 'BAY 2', save: async () => { throw { code: 11000 }; } }));
  await assert.rejects(master.update('bay', id(), { name: 'bay 1' }), duplicate);
});
test('availability route is Admin-only, precedes ID lookup, and does not exist on Services', async t => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-service-bays-secret-with-at-least-thirty-two-characters';
  t.after(() => { if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; });
  const descriptor = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
  Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
  t.after(() => descriptor ? Object.defineProperty(mongoose.connection, 'readyState', descriptor) : delete mongoose.connection.readyState);
  const user = { _id: id(), role: 'admin', authVersion: 0, status: 'active', isArchived: false, emailVerified: true };
  t.mock.method(User, 'findById', () => ({ select: async () => user }));
  t.mock.method(ServiceBay, 'exists', async () => true);
  const { signAccessToken } = require('../services/tokenService');
  const server = require('../app').listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = (path, token = signAccessToken(user)) => fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const response = await request('/service-bays/name-availability?name=%20Bay%201%20');
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { exists: true });
  assert.equal((await request('/services/name-availability?name=Bay')).status, 400);
  for (const role of ['client', 'mechanic']) {
    user.role = role;
    assert.equal((await request('/service-bays/name-availability?name=Bay')).status, 403);
  }
  assert.equal((await request('/service-bays/name-availability?name=Bay', 'invalid')).status, 401);
});
