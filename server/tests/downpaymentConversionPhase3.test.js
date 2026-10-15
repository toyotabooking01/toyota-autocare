const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const Schedule = require('../models/Schedule');
const Notification = require('../models/Notification');
const User = require('../models/User');
const cloudinary = require('../services/cloudinaryService');
const payments = require('../services/paymentService');
const bookings = require('../services/bookingService');
const holds = require('../services/bookingHoldService');
const engagement = require('../services/engagementService');
const receipts = require('../services/receiptService');

const id = () => String(new mongoose.Types.ObjectId());

function fixture(t, { official = 2, temporary = 1, maximum = 3, failOutcome = false } = {}) {
  const bookingId = id(); const clientId = id(); const scheduleId = id(); const paymentId = id();
  let state = { booking: { _id: bookingId, client: clientId, vehicle: id(), schedule: scheduleId,
    services: [], bookingType: 'online', status: 'awaiting_downpayment', holdStatus: 'payment_submitted',
    holdExpiresAt: null, estimatedTotalCents: 100000, downpaymentRequiredCents: 50000 },
  payment: { _id: paymentId, booking: bookingId, client: clientId, stage: 'downpayment', status: 'submitted',
    amountCents: 50000, method: 'gcash', reference: 'G123', createdAt: new Date() },
  schedule: { official, temporary, maximum }, notifications: [], receipts: [], writes: { payment: 0, booking: 0, schedule: 0 } };
  state.payments = [state.payment];
  t.mock.method(holds, 'releaseExpired', async () => {});
  t.mock.method(mongoose.connection, 'transaction', async callback => {
    const before = structuredClone(state);
    try { return await callback({}); }
    catch (error) { state = before; throw error; }
  });
  t.mock.method(Booking, 'findById', () => {
    const query = { session: () => query, lean: async () => ({ ...state.booking }) };
    return { select: () => query };
  });
  t.mock.method(Payment, 'findOne', filter => ({ session: () => ({ lean: async () => {
    const payment = state.payments.find(item => String(item._id) === String(filter._id)
      && String(item.booking) === String(filter.booking) && (!filter.status || filter.status === item.status));
    return payment ? { ...payment } : null;
  } }) }));
  t.mock.method(Payment, 'find', () => {
    const query = { session: () => query, lean: async () => state.payments.map(item => ({ ...item })) };
    return { sort: () => query };
  });
  t.mock.method(Payment, 'updateOne', async (filter, update) => {
    const payment = state.payments.find(item => String(item._id) === String(filter._id) && item.status === filter.status);
    if (!payment) return { modifiedCount: 0 };
    Object.assign(payment, update.$set); state.writes.payment++;
    return { modifiedCount: 1 };
  });
  t.mock.method(Payment, 'create', async ([record]) => {
    const created = { ...record, _id: id(), createdAt: new Date() };
    state.payments.push(created);
    return [created];
  });
  t.mock.method(cloudinary, 'uploadImage', async () => ({ secureUrl: 'https://example.invalid/new-proof.png',
    publicId: 'new-proof', width: 1, height: 1, format: 'png', bytes: 3 }));
  t.mock.method(Booking, 'updateOne', async (filter, update) => {
    if (state.booking.status !== filter.status || (filter.holdStatus && state.booking.holdStatus !== filter.holdStatus)
      || (filter.holdExpiresAt?.$gt && state.booking.holdExpiresAt <= filter.holdExpiresAt.$gt))
      return { modifiedCount: 0 };
    Object.assign(state.booking, update.$set || {});
    if (update.$push?.activity) state.booking.activity = [...(state.booking.activity || []), update.$push.activity];
    state.writes.booking++;
    return { modifiedCount: 1 };
  });
  t.mock.method(Booking, 'findOneAndUpdate', async (filter, update, options) => {
    const expected = filter.status?.$in ? filter.status.$in : [filter.status];
    if (!expected.includes(state.booking.status) || (filter.holdStatus && filter.holdStatus !== state.booking.holdStatus)) return null;
    const before = { ...state.booking };
    Object.assign(state.booking, update.$set || {});
    if (update.$push?.activity) state.booking.activity = [...(state.booking.activity || []), update.$push.activity];
    return options?.returnDocument === 'before' ? before : { ...state.booking };
  });
  t.mock.method(Booking, 'findOne', () => {
    const query = { select: () => query, lean: async () => ({ ...state.booking }), session: () => query,
      populate: () => query };
    return query;
  });
  t.mock.method(Schedule, 'updateOne', async (filter, update) => {
    if (update.$inc.temporaryHoldCount != null) {
      assert.deepEqual(filter.temporaryHoldCount, { $gt: 0 });
      if (update.$inc.currentBookingCount === 1) assert.ok(filter.$expr?.$and?.length === 2);
      if (state.schedule.temporary <= 0 || state.schedule.official >= state.schedule.maximum
        || !filter.temporaryHoldCount) return { modifiedCount: 0 };
      state.schedule.temporary += update.$inc.temporaryHoldCount;
    } else if (filter.currentBookingCount?.$gt && state.schedule.official <= 0) return { modifiedCount: 0 };
    state.schedule.official += update.$inc.currentBookingCount || 0;
    state.writes.schedule++;
    return { modifiedCount: 1 };
  });
  t.mock.method(engagement, 'recordDownpaymentOutcome', async (_session, booking, payment, decision) => {
    if (failOutcome) throw new Error('Notification write failed');
    state.notifications.push({ booking: booking._id, payment: payment._id, decision });
  });
  t.mock.method(engagement, 'recordBookingEvent', async () => {});
  t.mock.method(engagement, 'recordNotification', async () => {});
  t.mock.method(receipts, 'createForVerification', async (_session, booking, payment) => {
    const receiptId = id();
    state.receipts.push({ id: receiptId, booking: booking._id, payment: payment._id });
    return receiptId;
  });
  t.mock.method(receipts, 'processAfterVerification', async () => {});
  return { bookingId, clientId, paymentId, scheduleId, state: () => state,
    actor: role => ({ _id: id(), role }) };
}

for (const role of ['staff', 'admin']) {
  test(`${role} verification atomically converts a submitted downpayment to a pending reservation`, async t => {
    const f = fixture(t); const actor = f.actor(role);
    const result = await payments.decide(f.bookingId, f.paymentId, actor, 'verify');
    const state = f.state();
    assert.equal(state.payment.status, 'verified');
    assert.equal(state.payment.verifiedBy, actor._id);
    assert.equal(state.payment.verifiedByRole, role);
    assert.ok(state.payment.verifiedAt instanceof Date);
    assert.equal(state.booking.status, 'pending');
    assert.equal(state.booking.holdStatus, 'converted');
    assert.equal(state.booking.holdExpiresAt, null);
    assert.ok(state.booking.holdConvertedAt instanceof Date);
    assert.ok(state.booking.reservationActivatedAt instanceof Date);
    assert.equal(state.booking.activity.at(-1).action, 'downpayment_verified');
    assert.equal(state.schedule.official, 3);
    assert.equal(state.schedule.temporary, 0);
    assert.equal(state.schedule.official + state.schedule.temporary, 3);
    assert.deepEqual(state.writes, { payment: 1, booking: 1, schedule: 1 });
    assert.equal(state.notifications.length, 1);
    assert.equal(state.receipts.length, 1);
    assert.equal(String(state.receipts[0].payment), String(f.paymentId));
    assert.equal(result.bookingStatus, 'pending');
    assert.equal(result.downpaymentStatus, 'verified');
    await payments.decide(f.bookingId, f.paymentId, actor, 'verify');
    assert.deepEqual(f.state().writes, { payment: 1, booking: 1, schedule: 1 });
    assert.equal(f.state().notifications.length, 1);
    assert.equal(f.state().receipts.length, 1);
  });
}

test('Client and Mechanic cannot decide a downpayment', async t => {
  const f = fixture(t);
  for (const role of ['client', 'mechanic'])
    await assert.rejects(payments.decide(f.bookingId, f.paymentId, f.actor(role), 'verify'), { status: 403 });
  assert.deepEqual(f.state().writes, { payment: 0, booking: 0, schedule: 0 });
});

test('failed counter transfer rolls Payment and Booking back', async t => {
  const f = fixture(t, { temporary: 0 });
  await assert.rejects(payments.decide(f.bookingId, f.paymentId, f.actor('staff'), 'verify'), { status: 409 });
  const state = f.state();
  assert.equal(state.payment.status, 'submitted');
  assert.equal(state.booking.status, 'awaiting_downpayment');
  assert.equal(state.booking.holdStatus, 'payment_submitted');
  assert.deepEqual(state.writes, { payment: 0, booking: 0, schedule: 0 });
  assert.equal(state.notifications.length, 0);
  assert.equal(state.receipts.length, 0);
});

test('notification failure rolls back the converted payment, booking, and counters', async t => {
  const f = fixture(t, { failOutcome: true });
  await assert.rejects(payments.decide(f.bookingId, f.paymentId, f.actor('admin'), 'verify'), /Notification write failed/);
  assert.equal(f.state().payment.status, 'submitted');
  assert.equal(f.state().booking.status, 'awaiting_downpayment');
  assert.equal(f.state().booking.holdStatus, 'payment_submitted');
  assert.equal(f.state().schedule.official, 2);
  assert.equal(f.state().schedule.temporary, 1);
  assert.equal(f.state().receipts.length, 0);
});

test('post-commit document failure leaves verified payment, receipt, and reservation intact', async t => {
  const f = fixture(t);
  receipts.processAfterVerification.mock.mockImplementation(async () => { throw new Error('Document storage unavailable'); });
  const result = await payments.decide(f.bookingId, f.paymentId, f.actor('staff'), 'verify');
  assert.equal(result.downpaymentStatus, 'verified');
  assert.equal(f.state().booking.status, 'pending');
  assert.equal(f.state().schedule.official, 3);
  assert.equal(f.state().schedule.temporary, 0);
  assert.equal(f.state().receipts.length, 1);
});

test('final payment and legacy downpayment verification never transfer schedule counters', async t => {
  const f = fixture(t);
  f.state().booking.status = 'ready_for_release';
  f.state().booking.holdStatus = undefined;
  f.state().booking.finalTotalCents = 100000;
  f.state().payment.stage = 'final';
  f.state().payment.amountCents = 100000;
  await payments.decide(f.bookingId, f.paymentId, f.actor('staff'), 'verify');
  assert.equal(f.state().payment.status, 'verified');
  assert.equal(f.state().booking.status, 'ready_for_release');
  assert.equal(f.state().writes.schedule, 0);
  assert.equal(f.state().schedule.temporary, 1);
  assert.equal(f.state().schedule.official, 2);
  assert.equal(f.state().receipts.length, 0);

  f.state().booking.status = 'pending';
  f.state().payment.stage = 'downpayment';
  f.state().payment.status = 'submitted';
  f.state().payment.amountCents = 50000;
  await payments.decide(f.bookingId, f.paymentId, f.actor('admin'), 'verify');
  assert.equal(f.state().payment.verifiedByRole, 'admin');
  assert.equal(f.state().booking.status, 'pending');
  assert.equal(f.state().writes.schedule, 0);
});

for (const role of ['staff', 'admin']) {
  test(`${role} rejection reopens one fresh 15-minute retry without changing capacity`, async t => {
    const f = fixture(t); const actor = f.actor(role); const start = Date.now();
    const result = await payments.decide(f.bookingId, f.paymentId, actor, 'reject');
    const state = f.state();
    assert.equal(state.payment.status, 'rejected');
    assert.equal(state.booking.status, 'awaiting_downpayment');
    assert.equal(state.booking.holdStatus, 'active');
    assert.ok(state.booking.holdExpiresAt.getTime() >= start + holds.HOLD_MS);
    assert.ok(state.booking.holdExpiresAt.getTime() <= Date.now() + holds.HOLD_MS);
    assert.equal(state.schedule.official, 2);
    assert.equal(state.schedule.temporary, 1);
    assert.equal(state.notifications.length, 1);
    assert.equal(state.receipts.length, 0);
    assert.equal(result.downpaymentStatus, 'rejected');
    const expires = state.booking.holdExpiresAt.getTime();
    await payments.decide(f.bookingId, f.paymentId, actor, 'reject');
    assert.equal(f.state().booking.holdExpiresAt.getTime(), expires);
    assert.equal(f.state().notifications.length, 1);
  });
}

test('rejected proof remains in history while a new exact downpayment is submitted and verified', async t => {
  const f = fixture(t); const staff = f.actor('staff');
  f.state().payment.proofImage = { secureUrl: 'https://example.invalid/old-proof.png', publicId: 'old-proof',
    width: 1, height: 1, format: 'png', bytes: 3 };
  await payments.decide(f.bookingId, f.paymentId, staff, 'reject');
  const result = await payments.submit(f.bookingId, { _id: f.clientId, role: 'client' },
    { stage: 'downpayment', amount: '500.00', method: 'maya', reference: 'M456' },
    { buffer: Buffer.from('png'), mimetype: 'image/png' });
  const state = f.state();
  assert.equal(state.payments.length, 2);
  assert.equal(state.payments[0].status, 'rejected');
  assert.equal(state.payments[0].proofImage.publicId, 'old-proof');
  assert.notEqual(state.payments[1]._id, state.payments[0]._id);
  assert.equal(state.payments[1].status, 'submitted');
  assert.equal(state.booking.holdStatus, 'payment_submitted');
  assert.equal(state.booking.holdExpiresAt, null);
  assert.equal(result.downpaymentStatus, 'submitted');
  await payments.decide(f.bookingId, state.payments[1]._id, staff, 'verify');
  assert.equal(f.state().booking.status, 'pending');
  assert.equal(f.state().schedule.official, 3);
  assert.equal(f.state().schedule.temporary, 0);
});

test('verified pending booking confirms separately and cancellation releases official capacity', async t => {
  const f = fixture(t); const staff = f.actor('staff');
  await assert.rejects(bookings.transition(f.bookingId, staff, 'confirm'), { status: 409 });
  await payments.decide(f.bookingId, f.paymentId, staff, 'verify');
  assert.equal(f.state().booking.status, 'pending');
  assert.equal(f.state().schedule.official, 3);
  await bookings.transition(f.bookingId, staff, 'confirm');
  assert.equal(f.state().booking.status, 'confirmed');
  assert.equal(f.state().schedule.official, 3);
  await bookings.transition(f.bookingId, { _id: f.clientId, role: 'client' }, 'cancel');
  assert.equal(f.state().booking.status, 'cancelled');
  assert.equal(f.state().schedule.official, 2);
  assert.equal(f.state().schedule.temporary, 0);
});

test('rejected retry window expires through the existing hold cleanup exactly once', async t => {
  const releaseExpired = holds.releaseExpired;
  const f = fixture(t);
  await payments.decide(f.bookingId, f.paymentId, f.actor('admin'), 'reject');
  f.state().booking.holdExpiresAt = new Date(Date.now() - 1000);
  t.mock.method(Booking, 'find', () => ({ select: () => ({ lean: async () =>
    f.state().booking.holdStatus === 'active' ? [{ _id: f.bookingId }] : [] }) }));
  await releaseExpired({ schedule: f.scheduleId });
  await releaseExpired({ schedule: f.scheduleId });
  assert.equal(f.state().booking.status, 'cancelled');
  assert.equal(f.state().booking.holdStatus, 'released');
  assert.equal(f.state().booking.holdReleaseReason, 'expired');
  assert.equal(f.state().schedule.temporary, 0);
  assert.equal(f.state().schedule.official, 2);
});

test('conversion notifications use reserved but unconfirmed copy and deterministic keys', async t => {
  const clientId = id(); const staffId = id(); const adminId = id(); const bookingId = id(); const paymentId = id();
  const records = new Map();
  t.mock.method(User, 'find', filter => {
    const query = { session: () => query, lean: async () => filter.role === 'staff' ? [{ _id: staffId }] : [{ _id: adminId }] };
    return { select: () => query };
  });
  t.mock.method(Notification, 'updateOne', async (filter, update) => { records.set(filter.eventKey, update.$setOnInsert); });
  const booking = { _id: bookingId, client: clientId, vehicle: id() }; const payment = { _id: paymentId };
  await engagement.recordDownpaymentOutcome({}, booking, payment, 'verified', { _id: staffId, role: 'staff' });
  assert.equal(records.size, 2);
  const client = records.get(`payment:${paymentId}:verified:client`);
  assert.match(client.message, /schedule is now reserved/);
  assert.match(client.message, /awaiting confirmation/);
  assert.doesNotMatch(client.message, /booking is confirmed/i);
  assert.ok(records.has(`booking:${bookingId}:pending:admin:${adminId}`));
  await engagement.recordDownpaymentOutcome({}, booking, payment, 'rejected', { _id: adminId, role: 'admin' });
  assert.match(records.get(`payment:${paymentId}:rejected:client`).message, /15 minutes/);
});
