const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pagination, listPage, listResponse } = require('../utils/pagination');
const master = require('../services/masterDataService');
const people = require('../services/peopleVehiclesService');
const schedules = require('../services/scheduleService');
const bookings = require('../services/bookingService');
const jobs = require('../services/jobOrderService');
const engagement = require('../services/engagementService');
const models = Object.fromEntries(['Service', 'ServiceBay', 'User', 'Schedule', 'Booking', 'JobOrder', 'MaintenanceReminder'].map(name => [name, require(`../models/${name}`)]));

test('pagination is opt-in, defaults missing arguments, and bounds page size', () => {
  assert.equal(pagination({}), null);
  assert.deepEqual(pagination({ page: '2' }), { page: 2, limit: 10 });
  assert.deepEqual(pagination({ limit: '25' }), { page: 1, limit: 25 });
  for (const value of ['0', '-1', '1.5', 'NaN', '', '1e2', '9007199254740992', [], ['2'], {}]) assert.throws(() => pagination({ page: value }), { status: 400 });
  assert.throws(() => pagination({ limit: '51' }), { status: 400 });
});

function fixture(t, Model, total = 42) {
  const records = Array.from({ length: total }, (_, i) => ({ _id: String(i) }));
  const seen = {};
  t.mock.method(Model, 'countDocuments', async filter => { seen.countFilter = filter; return records.length; });
  t.mock.method(Model, 'find', filter => {
    seen.filter = filter; let start = 0, size = records.length;
    const query = {
      select(value) { seen.select = value; return query; }, populate(value) { seen.populate = value; return query; },
      sort(value) { seen.sort = value; return query; }, skip(value) { start = value; seen.skip = value; return query; },
      limit(value) { size = value; seen.limit = value; return query; }, lean: async () => records.slice(start, start + size),
    };
    return query;
  });
  return { seen, records };
}

const cases = [
  ['Services', 'Service', query => master.list('service', query), { archive: 'archived', status: 'inactive', search: 'Oil' }],
  ['Bays', 'ServiceBay', query => master.list('bay', query), { archive: 'active', status: 'maintenance', search: 'Bay' }],
  ['Mechanics', 'User', query => people.mechanicList(query), { archive: 'active', status: 'active', availability: 'busy', search: 'Juan' }],
  ['Schedules', 'Schedule', query => schedules.list(query), { date: '2099-01-01', enabled: 'true', search: '09' }],
  ['Bookings', 'Booking', query => bookings.list(query), { status: 'confirmed', date: '2099-01-01' }],
  ['Job Orders', 'JobOrder', query => jobs.list(undefined, query), {}],
  ['Reminders', 'MaintenanceReminder', query => engagement.reminders(undefined, query), {}],
];
for (const [label, name, list, filters] of cases) test(`${label}: filtered DB page, total count, stable ordering and legacy array`, async t => {
  const { seen } = fixture(t, models[name]);
  if (name === 'ServiceBay') {
    t.mock.method(models.JobOrder, 'find', () => ({ select: () => ({ lean: async () => [] }) }));
    t.mock.method(models.Booking, 'find', () => ({ select: () => ({ populate: () => ({ lean: async () => [] }) }) }));
  }
  const legacy = await list(filters);
  const legacyFilter = seen.filter;
  assert.equal(legacy.length, 42);
  assert.equal(seen.countFilter, undefined);
  const result = await list({ ...filters, page: '2', limit: '10' });
  assert.equal(result.items.length, 10); assert.equal(result.items[0]._id, '10');
  assert.equal(result.page, 2); assert.equal(result.limit, 10); assert.equal(result.totalItems, 42); assert.equal(result.totalPages, 5);
  assert.deepEqual(seen.countFilter, legacyFilter); assert.deepEqual(seen.filter, legacyFilter);
  assert.ok(seen.sort._id); assert.equal(seen.skip, 10); assert.equal(seen.limit, 10);
  if (name === 'User') assert.ok(!seen.select.includes('password'));
  if (['Booking', 'JobOrder', 'MaintenanceReminder'].includes(name)) assert.ok(seen.populate);
  assert.deepEqual(listResponse(legacy), { items: legacy }); assert.equal(listResponse(result), result);
});

test('page clamps after last record removed and empty data remains page one', async t => {
  const { records } = fixture(t, models.Service, 11);
  let result = await master.list('service', { page: '2', limit: '10' });
  assert.equal(result.items.length, 1);
  records.pop(); result = await master.list('service', { page: '2', limit: '10' });
  assert.equal(result.page, 1); assert.equal(result.items.length, 10);
  records.length = 0; result = await master.list('service', { page: '999999', limit: '10' });
  assert.deepEqual(result, { items: [], page: 1, limit: 10, totalItems: 0, totalPages: 0 });
});

test('booking search count and data use the same resolved client/vehicle filters', async t => {
  const { seen } = fixture(t, models.Booking);
  for (const Model of [models.User, require('../models/Vehicle')]) t.mock.method(Model, 'find', () => ({ select: () => ({ lean: async () => [{ _id: 'matched-id' }] }) }));
  await bookings.list({ search: 'Juan', status: 'confirmed', page: '1', limit: '25' });
  assert.equal(seen.filter.status, 'confirmed'); assert.equal(seen.filter.$or.length, 3);
  assert.deepEqual(seen.countFilter, seen.filter);
});

test('client/mechanic lists preserve ownership and existing unpaginated responses', async t => {
  for (const [Model, run, ownerField] of [[models.Booking, () => bookings.list({ page: '2' }, 'owner'), 'client'],
    [models.JobOrder, () => jobs.list('owner', { page: '2' }), 'mechanic'],
    [models.MaintenanceReminder, () => engagement.reminders('owner', { page: '2' }), 'client']]) {
    const { seen } = fixture(t, Model);
    assert.equal((await run()).length, 42); assert.equal(seen.filter[ownerField], 'owner'); assert.equal(seen.countFilter, undefined);
  }
});

test('legacy query executes without pagination operations', async () => {
  assert.deepEqual(await listPage({}, {}, {}, () => ({ lean: async () => ['legacy'] })), ['legacy']);
});

test('Admin list HTTP responses expose top-level metadata and keep legacy items responses', async t => {
  const mongoose = require('mongoose');
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'pagination-test-secret-with-more-than-thirty-two-characters';
  t.after(() => { if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret; });
  const descriptor = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
  Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
  t.after(() => descriptor ? Object.defineProperty(mongoose.connection, 'readyState', descriptor) : delete mongoose.connection.readyState);
  for (const Model of Object.values(models)) fixture(t, Model, 21);
  const admin = { _id: String(new mongoose.Types.ObjectId()), role: 'admin', authVersion: 0, status: 'active', isArchived: false };
  t.mock.method(models.User, 'findById', () => ({ select: async () => admin }));
  const token = require('../services/tokenService').signAccessToken(admin);
  const server = require('../app').listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = path => fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { headers: { Authorization: `Bearer ${token}` } });
  for (const path of ['/services', '/service-bays', '/mechanics', '/schedules', '/bookings', '/job-orders', '/maintenance-reminders']) {
    const response = await request(`${path}?page=99&limit=10`);
    assert.equal(response.status, 200, path);
    const data = await response.json();
    assert.equal(data.page, 3, path); assert.equal(data.limit, 10); assert.equal(data.totalItems, 21); assert.equal(data.totalPages, 3); assert.equal(data.items.length, 1);
    const legacy = await (await request(path)).json();
    assert.deepEqual(Object.keys(legacy), ['items']); assert.equal(legacy.items.length, 21);
    assert.equal((await request(`${path}?page=0&limit=10`)).status, 400);
  }
});
