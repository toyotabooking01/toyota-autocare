const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const app = require('../app');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Receipt = require('../models/Receipt');
const service = require('../services/receiptService');
const { signAccessToken } = require('../services/tokenService');

test('receipt routes enforce owner read access and Staff/Admin-only retries', async t => {
  const bookingId = new mongoose.Types.ObjectId();
  const receiptId = new mongoose.Types.ObjectId();
  const users = ['client', 'client', 'staff', 'admin', 'mechanic'].map(role => ({
    _id: new mongoose.Types.ObjectId(), role, status: 'active', isArchived: false,
    emailVerified: true, authVersion: 0,
  }));
  const [owner, stranger, staff, admin, mechanic] = users;
  const usersById = new Map(users.map(user => [String(user._id), user]));
  const previousSecret = process.env.JWT_SECRET;
  const previousReady = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
  process.env.JWT_SECRET = 'test-only-secret-value-with-more-than-thirty-two-bytes';
  Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
  t.mock.method(User, 'findById', raw => ({ select: async () => usersById.get(String(raw)) }));
  t.mock.method(Booking, 'findById', () => ({ select: () => ({ lean: async () => ({ client: owner._id }) }) }));
  const receipt = { _id: receiptId, payment: new mongoose.Types.ObjectId(), booking: bookingId,
    client: owner._id, receiptNumber: 'RCT-2026-000001', type: 'downpayment', issuedAt: new Date(),
    bookingSnapshot: { bookingReference: String(bookingId) },
    financialSnapshot: { amountPaidCents: 50000, estimatedRemainingCents: 50000 },
    paymentSnapshot: { method: 'gcash', verifiedAt: new Date() },
    document: { status: 'generated', secureUrl: 'https://example.invalid/receipt.pdf' },
    emailDelivery: { status: 'sent' } };
  t.mock.method(Receipt, 'findById', () => ({ lean: async () => receipt }));
  t.mock.method(Receipt, 'find', () => ({ sort: () => ({ lean: async () => [receipt] }) }));
  t.mock.method(service, 'retryDocument', async () => service.publicReceipt(receipt));
  t.mock.method(service, 'retryEmail', async () => service.publicReceipt(receipt));
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const origin = `http://127.0.0.1:${server.address().port}/api`;
    const request = (actor, path, method = 'GET') => fetch(`${origin}${path}`, { method,
      headers: { Authorization: `Bearer ${signAccessToken(actor)}` } });
    for (const path of [`/bookings/${bookingId}/receipts`, `/receipts/${receiptId}`]) {
      assert.equal((await request(owner, path)).status, 200);
      assert.equal((await request(stranger, path)).status, 404);
      assert.equal((await request(mechanic, path)).status, 403);
      assert.equal((await request(staff, path)).status, 200);
      assert.equal((await request(admin, path)).status, 200);
    }
    for (const action of ['document', 'email']) {
      const path = `/receipts/${receiptId}/retry-${action}`;
      assert.equal((await request(owner, path, 'POST')).status, 403);
      assert.equal((await request(mechanic, path, 'POST')).status, 403);
      assert.equal((await request(staff, path, 'POST')).status, 200);
      assert.equal((await request(admin, path, 'POST')).status, 200);
    }
    const publicBody = await (await request(owner, `/receipts/${receiptId}`)).json();
    assert.equal(publicBody.item.document.publicId, undefined);
    assert.equal(publicBody.item.financialSnapshot, undefined);
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (previousReady) Object.defineProperty(mongoose.connection, 'readyState', previousReady);
    else delete mongoose.connection.readyState;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
