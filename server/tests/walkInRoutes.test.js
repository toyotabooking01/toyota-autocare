const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const app = require('../app');
const { signAccessToken } = require('../services/tokenService');

test('Walk-In lookup, creation and Check-In routes are Staff-only', async () => {
  const oldSecret = process.env.JWT_SECRET;
  const oldReady = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
  const oldById = User.findById;
  const oldFind = User.find;
  const oldExists = User.exists;
  const oldVehicles = Vehicle.find;
  const oldAggregate = Vehicle.aggregate;
  const people = ['admin', 'client', 'mechanic', 'staff'].map(role => ({ _id: new mongoose.Types.ObjectId(), role, status: 'active', isArchived: false, emailVerified: true, authVersion: 0 }));
  const byId = new Map(people.map(person => [String(person._id), person]));
  process.env.JWT_SECRET = 'test-only-secret-value-with-more-than-thirty-two-bytes';
  Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
  User.findById = value => ({ select: async () => byId.get(String(value)) });
  User.find = () => ({ select: () => ({ sort: () => ({ limit: () => ({ lean: async () => [
    { _id: people[1]._id, fullName: 'Client Example', email: 'client@example.invalid', password: 'must-not-return', authVersion: 8 },
  ] }) }) }) });
  User.exists = async () => ({ _id: people[1]._id });
  Vehicle.find = () => ({ select: () => ({ sort: () => ({ lean: async () => [] }) }) });
  Vehicle.aggregate = async () => [];
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    async function request(path, person, method = 'GET', body) {
      return fetch(`${origin}${path}`, { method,
        headers: { Authorization: `Bearer ${signAccessToken(person)}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    }
    const lookup = '/api/bookings/walk-in/clients?search=Client';
    assert.equal((await request(lookup, people[1])).status, 403);
    assert.equal((await request(lookup, people[2])).status, 403);
    assert.equal((await request(lookup, people[0])).status, 403);
    const adminLookup = await request(lookup, people[3]);
    assert.equal(adminLookup.status, 200);
    const selected = (await adminLookup.json()).items[0];
    assert.equal(selected.fullName, 'Client Example');
    assert.equal(selected.vehicleCount, 0);
    const vehiclesPath = `/api/bookings/walk-in/clients/${people[1]._id}/vehicles`;
    assert.equal((await request(vehiclesPath, people[1])).status, 403);
    assert.equal((await request(vehiclesPath, people[0])).status, 403);
    assert.equal((await request(vehiclesPath, people[3])).status, 200);
    assert.equal((await request(vehiclesPath, people[0], 'POST', {})).status, 403);
    assert.equal((await request(vehiclesPath, people[1], 'POST', {})).status, 403);
    assert.equal((await request(vehiclesPath, people[3], 'POST', {})).status, 400);
    assert.equal((await request('/api/bookings/walk-in', people[1], 'POST', {})).status, 403);
    assert.equal((await request('/api/bookings/walk-in', people[2], 'POST', {})).status, 403);
    assert.equal((await request('/api/bookings/walk-in', people[0], 'POST', {})).status, 403);
    assert.equal((await request('/api/bookings/walk-in', people[3], 'POST', {})).status, 400);
    const checkIn = '/api/bookings/not-an-id/check-in';
    assert.equal((await request(checkIn, people[1], 'POST', {})).status, 403);
    assert.equal((await request(checkIn, people[2], 'POST', {})).status, 403);
    assert.equal((await request(checkIn, people[0], 'POST', {})).status, 403);
    assert.equal((await request(checkIn, people[3], 'POST', {})).status, 400);
  } finally {
    await new Promise(resolve => server.close(resolve));
    User.findById = oldById; User.find = oldFind; User.exists = oldExists; Vehicle.find = oldVehicles; Vehicle.aggregate = oldAggregate;
    if (oldReady) Object.defineProperty(mongoose.connection, 'readyState', oldReady);
    else delete mongoose.connection.readyState;
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  }
});
