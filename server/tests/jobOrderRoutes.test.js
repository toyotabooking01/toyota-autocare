const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../models/User');
const app = require('../app');
const jobs = require('../services/jobOrderService');
const { signAccessToken } = require('../services/tokenService');

test('assignment and release are Staff-only; Admin monitors and Mechanics read assigned jobs', async () => {
  const oldSecret = process.env.JWT_SECRET;
  const oldReady = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
  const oldUser = User.findById;
  const oldList = jobs.list; const oldGet = jobs.get; const oldOptions = jobs.options; const oldAssign = jobs.assign;
  const oldActive = jobs.active; const oldWork = jobs.saveWork; const oldTransition = jobs.transition;
  const users = ['admin', 'client', 'mechanic', 'staff'].map(role => ({ _id: new mongoose.Types.ObjectId(), role,
    status: 'active', isArchived: false, emailVerified: true, authVersion: 0 }));
  const byId = new Map(users.map(user => [String(user._id), user]));
  const jobId = String(new mongoose.Types.ObjectId());
  const bookingId = String(new mongoose.Types.ObjectId());
  let listedFor; let viewedFor;
  process.env.JWT_SECRET = 'test-only-secret-value-with-more-than-thirty-two-bytes';
  Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
  User.findById = value => ({ select: async () => byId.get(String(value)) });
  jobs.list = async mechanic => { listedFor = mechanic; return []; };
  jobs.get = async (rawId, mechanic) => {
    viewedFor = mechanic;
    if (mechanic && String(mechanic) !== String(users[2]._id)) return null;
    return { _id: rawId };
  };
  jobs.options = async () => ({ mechanics: [], serviceBays: [] });
  jobs.assign = async (rawId, body) => ({ _id: jobId, booking: rawId, mechanic: body.mechanic, serviceBay: body.serviceBay });
  jobs.active = async () => ({ _id: jobId });
  jobs.saveWork = async () => ({ _id: jobId });
  jobs.transition = async (rawId, actor, action) => ({ _id: rawId, role: actor.role, action });
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    async function request(path, user, method = 'GET', body) {
      return fetch(`${origin}${path}`, { method, headers: { Authorization: `Bearer ${signAccessToken(user)}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}) });
    }
    assert.equal((await request('/api/bookings/assignment-options', users[0])).status, 403);
    assert.equal((await request('/api/bookings/assignment-options', users[3])).status, 200);
    assert.equal((await request('/api/bookings/assignment-options', users[2])).status, 403);
    assert.equal((await request(`/api/bookings/${bookingId}/assign`, users[1], 'POST', {})).status, 403);
    assert.equal((await request(`/api/bookings/${bookingId}/assign`, users[2], 'POST', {})).status, 403);
    assert.equal((await request(`/api/bookings/${bookingId}/assign`, users[0], 'POST', {})).status, 403);
    assert.equal((await request(`/api/bookings/${bookingId}/assign`, users[3], 'POST',
      { mechanic: String(users[2]._id), serviceBay: String(new mongoose.Types.ObjectId()) })).status, 201);
    assert.equal((await request('/api/job-orders', users[1])).status, 403);
    assert.equal((await request('/api/job-orders', users[2])).status, 200);
    assert.equal(String(listedFor), String(users[2]._id));
    assert.equal((await request(`/api/job-orders/${jobId}`, users[2])).status, 200);
    assert.equal(String(viewedFor), String(users[2]._id));
    assert.equal((await request('/api/job-orders', users[0])).status, 200);
    assert.equal((await request('/api/job-orders', users[3])).status, 200);
    assert.equal(listedFor, undefined);
    assert.equal((await request(`/api/job-orders/${jobId}`, users[0])).status, 200);
    assert.equal(viewedFor, undefined);
    assert.equal((await request('/api/job-orders/active', users[2])).status, 200);
    assert.equal((await request('/api/job-orders/active', users[0])).status, 403);
    assert.equal((await request(`/api/job-orders/${jobId}/work`, users[1], 'PUT', {})).status, 403);
    assert.equal((await request(`/api/job-orders/${jobId}/work`, users[0], 'PUT', {})).status, 403);
    assert.equal((await request(`/api/job-orders/${jobId}/work`, users[2], 'PUT', { mechanicNotes: 'Done' })).status, 200);
    for (const action of ['start', 'final-inspection']) {
      assert.equal((await request(`/api/job-orders/${jobId}/${action}`, users[2], 'POST')).status, 200);
      assert.equal((await request(`/api/job-orders/${jobId}/${action}`, users[0], 'POST')).status, 403);
    }
    for (const action of ['ready-for-release', 'complete']) {
      assert.equal((await request(`/api/job-orders/${jobId}/${action}`, users[3], 'POST')).status, 200);
      assert.equal((await request(`/api/job-orders/${jobId}/${action}`, users[0], 'POST')).status, 403);
      assert.equal((await request(`/api/job-orders/${jobId}/${action}`, users[2], 'POST')).status, 403);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    User.findById = oldUser; jobs.list = oldList; jobs.get = oldGet; jobs.options = oldOptions; jobs.assign = oldAssign;
    jobs.active = oldActive; jobs.saveWork = oldWork; jobs.transition = oldTransition;
    if (oldReady) Object.defineProperty(mongoose.connection, 'readyState', oldReady);
    else delete mongoose.connection.readyState;
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  }
});
