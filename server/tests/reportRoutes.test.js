const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../models/User');
const app = require('../app');
const reports = require('../services/reportService');
const { signAccessToken } = require('../services/tokenService');

test('Reports summary endpoint is Admin-only', async () => {
  const oldSecret = process.env.JWT_SECRET;
  const oldReady = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
  const oldUser = User.findById; const oldSummary = reports.summary;
  const users = ['admin', 'client', 'mechanic'].map(role => ({ _id: new mongoose.Types.ObjectId(), role,
    status: 'active', isArchived: false, emailVerified: true, authVersion: 0 }));
  const byId = new Map(users.map(user => [String(user._id), user]));
  let query;
  process.env.JWT_SECRET = 'test-only-secret-value-with-more-than-thirty-two-bytes';
  Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
  User.findById = value => ({ select: async () => byId.get(String(value)) });
  reports.summary = async value => { query = value; return { totalBookings: 0 }; };
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    async function request(user) { return fetch(`${origin}/api/reports/summary?from=2026-10-01&to=2026-10-07`, {
      headers: { Authorization: `Bearer ${signAccessToken(user)}` },
    }); }
    assert.equal((await request(users[1])).status, 403);
    assert.equal((await request(users[2])).status, 403);
    assert.equal((await request(users[0])).status, 200);
    assert.equal(query.from, '2026-10-01');
  } finally {
    await new Promise(resolve => server.close(resolve));
    User.findById = oldUser; reports.summary = oldSummary;
    if (oldReady) Object.defineProperty(mongoose.connection, 'readyState', oldReady);
    else delete mongoose.connection.readyState;
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  }
});
