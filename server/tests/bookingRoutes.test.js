const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../models/User');
const Schedule = require('../models/Schedule');
const app = require('../app');
const { signAccessToken } = require('../services/tokenService');

test('schedule mutations require Admin and booking routes exclude Mechanic', async () => {
  const oldSecret = process.env.JWT_SECRET;
  const oldReady = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
  const oldUser = User.findById;
  const oldSlots = Schedule.find;
  const users = ['admin', 'client', 'mechanic'].map(role => ({ _id: new mongoose.Types.ObjectId(), role, status: 'active', isArchived: false, emailVerified: true, authVersion: 0 }));
  const byId = new Map(users.map(user => [String(user._id), user]));
  process.env.JWT_SECRET = 'test-only-secret-value-with-more-than-thirty-two-bytes';
  Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
  User.findById = value => ({ select: async () => byId.get(String(value)) });
  Schedule.find = () => ({ sort: () => ({ lean: async () => [] }) });
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    async function request(path, user, method = 'GET', body) {
      const response = await fetch(`${origin}${path}`, { method, headers: { Authorization: `Bearer ${signAccessToken(user)}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return response.status;
    }
    assert.equal(await request('/api/schedules/available', users[1]), 200);
    assert.equal(await request('/api/schedules/available', users[0]), 403);
    assert.equal(await request('/api/schedules', users[1], 'POST', {}), 403);
    assert.equal(await request('/api/schedules', users[2], 'POST', {}), 403);
    assert.equal(await request('/api/schedules', users[0], 'POST', {}), 400);
    assert.equal(await request('/api/bookings', users[2]), 403);
    assert.equal(await request('/api/bookings', users[0], 'POST', {}), 403);
    assert.equal(await request('/api/bookings/availability', users[1]), 400); // Client route is reachable; query validation rejects missing service IDs.
    assert.equal(await request('/api/bookings/availability', users[0]), 400);
    assert.equal(await request('/api/bookings/availability', users[2]), 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
    User.findById = oldUser; Schedule.find = oldSlots;
    if (oldReady) Object.defineProperty(mongoose.connection, 'readyState', oldReady);
    else delete mongoose.connection.readyState;
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  }
});
