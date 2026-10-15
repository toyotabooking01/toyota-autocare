const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const cloudinaryService = require('../services/cloudinaryService');
const app = require('../app');
const { signAccessToken } = require('../services/tokenService');
const holds = require('../services/bookingHoldService');

test('payment route checks ownership and rejects invalid multipart files and forged metadata', async t => {
  t.mock.method(holds, 'releaseExpired', async () => {});
  const bookingId = String(new mongoose.Types.ObjectId());
  const client = { _id: new mongoose.Types.ObjectId(), role: 'client', status: 'active', isArchived: false,
    emailVerified: true, authVersion: 0 };
  const stranger = { ...client, _id: new mongoose.Types.ObjectId() };
  const mechanic = { ...client, _id: new mongoose.Types.ObjectId(), role: 'mechanic' };
  const users = new Map([client, stranger, mechanic].map(user => [String(user._id), user]));
  const previousSecret = process.env.JWT_SECRET;
  const previousReady = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
  process.env.JWT_SECRET = 'test-only-secret-value-with-more-than-thirty-two-bytes';
  Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
  t.mock.method(User, 'findById', raw => ({ select: async () => users.get(String(raw)) }));
  t.mock.method(Booking, 'findById', () => ({ select: () => ({ lean: async () => ({ _id: bookingId,
    client: client._id, services: [], status: 'ready_for_release', finalTotalCents: 10000 }) }) }));
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const origin = `http://127.0.0.1:${server.address().port}/api/bookings/${bookingId}/payments`;
    async function send(actor, type, size = 3) {
      const body = new FormData();
      body.append('stage', 'final'); body.append('amount', '100'); body.append('method', 'gcash');
      body.append('proof', new Blob([Buffer.alloc(size)], { type }), 'proof.bin');
      const response = await fetch(origin, { method: 'POST', headers: { Authorization: `Bearer ${signAccessToken(actor)}` }, body });
      return { status: response.status, body: await response.json() };
    }
    assert.equal((await send(stranger, 'image/gif')).status, 404);
    assert.equal((await send(mechanic, 'image/png')).status, 403);
    const invalid = await send(client, 'image/gif');
    assert.equal(invalid.status, 400);
    assert.match(invalid.body.message, /JPEG, PNG, and WebP/);
    const oversized = await send(client, 'image/png', 8 * 1024 * 1024 + 1);
    assert.equal(oversized.status, 413);
    const response = await fetch(origin, { method: 'POST', headers: { Authorization: `Bearer ${signAccessToken(client)}`,
      'Content-Type': 'application/json' }, body: JSON.stringify({ stage: 'final', amount: 100, method: 'gcash',
      proofImage: { secureUrl: 'https://attacker.invalid/proof', publicId: 'fake' } }) });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).message, 'Invalid payment submission.');
    t.mock.method(Payment, 'find', () => ({ sort: () => ({ lean: async () => [] }) }));
    t.mock.method(cloudinaryService, 'uploadImage', async () => { throw new Error('test-secret-never-expose'); });
    const unavailable = await send(client, 'image/png');
    assert.equal(unavailable.status, 500);
    assert.equal(unavailable.body.message, 'Request could not be processed');
    assert.equal(JSON.stringify(unavailable.body).includes('test-secret-never-expose'), false);
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (previousReady) Object.defineProperty(mongoose.connection, 'readyState', previousReady);
    else delete mongoose.connection.readyState;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
