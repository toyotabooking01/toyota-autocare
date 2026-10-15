const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const app = require('../app');
const User = require('../models/User');
const ToyotaCatalog = require('../models/ToyotaCatalog');
const { signAccessToken } = require('../services/tokenService');

test('Toyota catalog endpoints filter active PH entries and allow Client and Staff', async t => {
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-only-toyota-catalog-secret-more-than-thirty-two-bytes';
  t.after(() => { if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret; });
  const oldReady = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
  Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
  t.after(() => { if (oldReady) Object.defineProperty(mongoose.connection, 'readyState', oldReady); else delete mongoose.connection.readyState; });
  const users = ['client', 'staff', 'mechanic'].map(role => ({ _id: new mongoose.Types.ObjectId(), role,
    status: 'active', isArchived: false, emailVerified: true, authVersion: 0, mustChangePassword: false }));
  t.mock.method(User, 'findById', id => ({ select: async () => users.find(user => String(user._id) === String(id)) }));
  const entry = { _id: new mongoose.Types.ObjectId(), make: 'Toyota', market: 'Philippines', model: 'Fortuner',
    year: 2025, variant: '2.4 G 4x2 AT', transmission: 'automatic', imageUrl: '/toyota/fortuner.png' };
  const find = t.mock.method(ToyotaCatalog, 'find', () => ({ select: () => ({ sort: () => ({ lean: async () => [entry] }) }) }));
  const distinct = t.mock.method(ToyotaCatalog, 'distinct', async (field, filter) => field === 'model' ? ['Fortuner']
    : filter.model.$regex === '^Corolla Altis$' ? [2023, 2008, 2026, 2023] : [2025]);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const get = (path, user) => fetch(origin + path, { headers: { Authorization: `Bearer ${signAccessToken(user)}` } });

  const response = await get('/api/toyota/catalog', users[0]);
  assert.equal(response.status, 200);
  const catalogBody = await response.json();
  assert.equal(catalogBody.items[0].model, 'Fortuner');
  assert.equal(catalogBody.models.some(item => item.model === 'Vios'), false);
  assert.deepEqual(catalogBody.models.find(item => item.model === 'Fortuner').years, [2025]);
  assert.deepEqual(find.mock.calls[0].arguments[0], { make: 'Toyota', market: 'Philippines', isActive: true });
  assert.ok((await (await get('/api/toyota/models', users[1])).json()).items.includes('Fortuner'));
  const fortunerYears = (await (await get('/api/toyota/years?model=Fortuner', users[1])).json()).items;
  assert.deepEqual(fortunerYears, [2025]);
  assert.deepEqual((await (await get('/api/toyota/years?model=Corolla%20Altis', users[0])).json()).items,
    [2026, 2023, 2008]);
  assert.equal(distinct.mock.calls[1].arguments[1].model.$regex, '^Corolla Altis$');
  assert.equal((await (await get('/api/toyota/variants?model=Fortuner&year=2025', users[0])).json()).items[0].variant, entry.variant);
  assert.ok(find.mock.calls.some(call => call.arguments[0].year === 2025));
  assert.equal((await get('/api/toyota/years?model=Fortuner', users[2])).status, 403);
  assert.equal((await get('/api/toyota/variants?model=Fortuner&year=oops', users[0])).status, 400);
});
