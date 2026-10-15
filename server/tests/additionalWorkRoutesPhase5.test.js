const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../models/User');
const Booking = require('../models/Booking');
const JobOrder = require('../models/JobOrder');
const work = require('../services/additionalWorkService');
const app = require('../app');
const { signAccessToken } = require('../services/tokenService');

test('additional-work routes enforce role permissions and booking ownership', async t => {
  const bookingId = String(new mongoose.Types.ObjectId());
  const jobId = String(new mongoose.Types.ObjectId());
  const workId = String(new mongoose.Types.ObjectId());
  const actors = ['client', 'client', 'mechanic', 'mechanic', 'staff', 'admin'].map(role => ({
    _id: new mongoose.Types.ObjectId(), role, status: 'active', isArchived: false,
    emailVerified: true, authVersion: 0,
  }));
  const [owner, stranger, mechanic, otherMechanic, staff, admin] = actors;
  const byId = new Map(actors.map(actor => [String(actor._id), actor]));
  const previousSecret = process.env.JWT_SECRET;
  const previousReady = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
  process.env.JWT_SECRET = 'test-only-secret-value-with-more-than-thirty-two-bytes';
  Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
  t.mock.method(User, 'findById', raw => ({ select: async () => byId.get(String(raw)) }));
  t.mock.method(Booking, 'findById', () => ({ select: () => ({ lean: async () => ({
    _id: bookingId, client: owner._id, assignedMechanic: mechanic._id,
  }) }) }));
  t.mock.method(JobOrder, 'findOne', filter => ({ populate: () => ({ lean: async () =>
    !filter.mechanic || String(filter.mechanic) === String(mechanic._id)
      ? { _id: jobId, booking: { _id: bookingId }, mechanic: mechanic._id } : null }) }));
  t.mock.method(work, 'list', async (rawId, actor) => {
    if (actor.role === 'client' && String(actor._id) !== String(owner._id)) throw Object.assign(new Error('Booking not found.'), { status: 404 });
    if (actor.role === 'mechanic' && String(actor._id) !== String(mechanic._id)) throw Object.assign(new Error('Booking not found.'), { status: 404 });
    return [{ booking: rawId }];
  });
  t.mock.method(work, 'get', async (_rawId, actor) => {
    if (actor.role === 'client' && String(actor._id) !== String(owner._id)) throw Object.assign(new Error('Request not found.'), { status: 404 });
    return { _id: workId };
  });
  t.mock.method(work, 'create', async () => ({ _id: workId }));
  t.mock.method(work, 'mutate', async () => ({ _id: workId }));
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const request = (actor, path, method = 'GET') => fetch(`${base}${path}`, { method,
      headers: { Authorization: `Bearer ${signAccessToken(actor)}` } });
    assert.equal((await request(owner, `/bookings/${bookingId}/additional-work`)).status, 200);
    assert.equal((await request(stranger, `/bookings/${bookingId}/additional-work`)).status, 404);
    assert.equal((await request(mechanic, `/job-orders/${jobId}/additional-work`)).status, 200);
    assert.equal((await request(otherMechanic, `/job-orders/${jobId}/additional-work`)).status, 404);
    assert.equal((await request(owner, `/job-orders/${jobId}/additional-work`, 'POST')).status, 403);
    assert.equal((await request(staff, `/job-orders/${jobId}/additional-work`, 'POST')).status, 403);
    assert.equal((await request(mechanic, `/job-orders/${jobId}/additional-work`, 'POST')).status, 201);
    assert.equal((await request(admin, `/job-orders/${jobId}/additional-work`, 'POST')).status, 201);
    for (const [action, allowed] of [['send', ['staff', 'admin']], ['reject', ['staff', 'admin']],
      ['approve', ['client']], ['decline', ['client']], ['perform', ['mechanic', 'admin']]]) {
      for (const actor of [owner, mechanic, staff, admin]) {
        const response = await request(actor, `/additional-work/${workId}/${action}`, 'POST');
        assert.equal(response.status, allowed.includes(actor.role) ? 200 : 403, `${actor.role} ${action}`);
      }
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (previousReady) Object.defineProperty(mongoose.connection, 'readyState', previousReady);
    else delete mongoose.connection.readyState;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
