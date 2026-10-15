const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Schedule = require('../models/Schedule');
const Payment = require('../models/Payment');
const holds = require('../services/bookingHoldService');
const payments = require('../services/paymentService');
const bookings = require('../services/bookingService');
const cloudinary = require('../services/cloudinaryService');

const id = () => String(new mongoose.Types.ObjectId());

test('expired hold releases temporary capacity once and retains booking audit state', async t => {
  const bookingId = id(); const scheduleId = id(); const now = new Date();
  let state = { _id: bookingId, schedule: scheduleId, status: 'awaiting_downpayment', holdStatus: 'active',
    holdExpiresAt: new Date(now.getTime() - 1000) };
  let count = 1;
  t.mock.method(Booking, 'find', () => ({ select: () => ({ lean: async () => state.holdStatus === 'active' ? [{ _id: bookingId }] : [] }) }));
  t.mock.method(mongoose.connection, 'transaction', callback => callback({}));
  t.mock.method(Booking, 'findOneAndUpdate', async (filter, update) => {
    if (state.holdStatus !== filter.holdStatus || state.status !== filter.status) return null;
    const previous = { ...state }; state = { ...state, ...update.$set }; return previous;
  });
  t.mock.method(Schedule, 'updateOne', async (filter, update) => {
    assert.equal(filter.temporaryHoldCount.$gt, 0);
    count += update.$inc.temporaryHoldCount;
    return { modifiedCount: 1 };
  });
  await holds.releaseExpired({ schedule: scheduleId }, now);
  await holds.releaseExpired({ schedule: scheduleId }, now);
  assert.equal(count, 0);
  assert.equal(state.status, 'cancelled');
  assert.equal(state.holdStatus, 'released');
  assert.equal(state.holdReleaseReason, 'expired');
  assert.equal(state.cancellationReason, 'downpayment_hold_expired');
});

test('provisional downpayment rejects manipulated amounts and non-digital methods before upload', async t => {
  const bookingId = id(); const clientId = id();
  const booking = { _id: bookingId, client: clientId, services: [], status: 'awaiting_downpayment',
    estimatedTotalCents: 10001, downpaymentRequiredCents: 5001, holdStatus: 'active',
    holdExpiresAt: new Date(Date.now() + 60_000) };
  t.mock.method(holds, 'releaseExpired', async () => {});
  t.mock.method(Booking, 'findById', () => ({ select: () => ({ lean: async () => booking }) }));
  t.mock.method(Payment, 'find', () => ({ sort: () => ({ lean: async () => [] }) }));
  let uploads = 0;
  t.mock.method(cloudinary, 'uploadImage', async () => { uploads++; return {}; });
  const actor = { _id: clientId, role: 'client' };
  const file = { buffer: Buffer.from('png'), mimetype: 'image/png' };
  for (const amount of ['50.00', '50.02', '100.01']) {
    await assert.rejects(payments.submit(bookingId, actor,
      { stage: 'downpayment', amount, method: 'gcash', reference: 'G123' }, file), { status: 400 });
  }
  await assert.rejects(payments.submit(bookingId, actor,
    { stage: 'downpayment', amount: '50.01', method: 'cash', reference: 'C123' }), { status: 400 });
  await assert.rejects(payments.submit(bookingId, actor,
    { stage: 'downpayment', amount: '50.01', method: 'maya', reference: ' ' }, file), { status: 400 });
  assert.equal(uploads, 0);
  assert.equal(Math.ceil(booking.estimatedTotalCents / 2), booking.downpaymentRequiredCents);
});

test('accepted provisional payment remains a temporary hold awaiting verification', async t => {
  const bookingId = id(); const clientId = id();
  const booking = { _id: bookingId, client: clientId, services: [], status: 'awaiting_downpayment',
    estimatedTotalCents: 600000, downpaymentRequiredCents: 300000, holdStatus: 'active',
    holdExpiresAt: new Date(Date.now() + 60_000) };
  const records = [];
  t.mock.method(holds, 'releaseExpired', async () => {});
  t.mock.method(Booking, 'findById', () => {
    const query = { session: () => query, lean: async () => ({ ...booking }) };
    return { select: () => query };
  });
  t.mock.method(Payment, 'find', () => {
    const query = { session: () => query, lean: async () => records };
    return { sort: () => query };
  });
  t.mock.method(cloudinary, 'uploadImage', async () => ({ secureUrl: 'https://example.invalid/proof.png', publicId: 'proof', width: 1, height: 1, format: 'png' }));
  t.mock.method(mongoose.connection, 'transaction', callback => callback({}));
  t.mock.method(Payment, 'create', async ([record]) => { const saved = { ...record, _id: id() }; records.push(saved); return [saved]; });
  t.mock.method(Booking, 'updateOne', async (filter, update) => {
    assert.equal(filter.holdStatus, 'active');
    assert.equal(update.$set.holdStatus, 'payment_submitted');
    Object.assign(booking, update.$set);
    return { modifiedCount: 1 };
  });
  const result = await payments.submit(bookingId, { _id: clientId, role: 'client' },
    { stage: 'downpayment', amount: '3000.00', method: 'gcash', reference: 'G123' },
    { buffer: Buffer.from('png'), mimetype: 'image/png' });
  assert.equal(result.bookingStatus, 'awaiting_downpayment');
  assert.equal(result.holdStatus, 'payment_submitted');
  assert.equal(result.holdExpiresAt, null);
  assert.equal(records[0].status, 'submitted');
  assert.equal(records[0].amountCents, 300000);
});

test('expired provisional hold rejects payment before proof upload', async t => {
  const bookingId = id(); const clientId = id();
  const booking = { _id: bookingId, client: clientId, services: [], status: 'awaiting_downpayment',
    estimatedTotalCents: 100000, downpaymentRequiredCents: 50000, holdStatus: 'active',
    holdExpiresAt: new Date(Date.now() - 1000) };
  let uploads = 0; let cleanups = 0;
  t.mock.method(holds, 'releaseExpired', async () => {
    cleanups++; booking.status = 'cancelled'; booking.holdStatus = 'released'; booking.holdReleaseReason = 'expired';
  });
  t.mock.method(Booking, 'findById', () => ({ select: () => ({ lean: async () => booking }) }));
  t.mock.method(cloudinary, 'uploadImage', async () => { uploads++; return {}; });
  await assert.rejects(payments.submit(bookingId, { _id: clientId, role: 'client' },
    { stage: 'downpayment', amount: '500.00', method: 'gcash', reference: 'G123' },
    { buffer: Buffer.from('png'), mimetype: 'image/png' }),
  error => error.status === 409 && error.message === holds.expiredMessage);
  assert.equal(cleanups, 1);
  assert.equal(uploads, 0);
});

test('client cancellation releases only the temporary counter once', async t => {
  const bookingId = id(); const clientId = id(); const scheduleId = id();
  let status = 'awaiting_downpayment'; let holdStatus = 'active'; let temporary = 1; let official = 0;
  t.mock.method(holds, 'releaseExpired', async () => {});
  t.mock.method(mongoose.connection, 'transaction', callback => callback({}));
  t.mock.method(Booking, 'findOneAndUpdate', async (filter, update) => {
    if (filter.status !== status || filter.holdStatus !== holdStatus) return null;
    const before = { schedule: scheduleId };
    status = update.$set.status; holdStatus = update.$set.holdStatus;
    return before;
  });
  t.mock.method(Schedule, 'updateOne', async (filter, update) => {
    assert.equal(filter.temporaryHoldCount.$gt, 0);
    temporary += update.$inc.temporaryHoldCount;
    official += update.$inc.currentBookingCount || 0;
    return { modifiedCount: 1 };
  });
  t.mock.method(Booking, 'findOne', () => ({ populate: () => ({ lean: async () => ({ _id: bookingId,
    status, holdStatus, holdReleaseReason: 'client_cancelled' }) }),
  session: () => ({ select: () => ({ lean: async () => ({ _id: bookingId }) }) }) }));
  const actor = { _id: clientId, role: 'client' };
  const cancelled = await bookings.transition(bookingId, actor, 'cancel');
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(temporary, 0);
  assert.equal(official, 0);
  await assert.rejects(bookings.transition(bookingId, actor, 'cancel'), { status: 409 });
  assert.equal(temporary, 0);
});
