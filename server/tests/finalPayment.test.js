const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const JobOrder = require('../models/JobOrder');
const User = require('../models/User');
const ServiceBay = require('../models/ServiceBay');
const payments = require('../services/paymentService');
const jobs = require('../services/jobOrderService');
const engagement = require('../services/engagementService');

const id = () => String(new mongoose.Types.ObjectId());
const bookingId = id(); const clientId = id(); const staffId = id(); const adminId = id();
const client = { _id: clientId, role: 'client' };
const staff = { _id: staffId, role: 'staff' };
const admin = { _id: adminId, role: 'admin' };

test('ready-for-release summary moves from due to submitted to paid only after verification', async t => {
  const records = [];
  t.mock.method(Booking, 'findById', () => ({ select: () => ({ lean: async () => ({ _id: bookingId,
    client: clientId, services: [id()], status: 'ready_for_release', finalTotalCents: 120000 }) }) }));
  t.mock.method(Payment, 'find', () => ({ sort: () => ({ lean: async () => records }) }));
  let result = await payments.summary(bookingId, client);
  assert.equal(result.paymentStatus, 'final_payment_due');
  assert.equal(result.finalTotalCents, 120000);
  assert.equal(result.remainingBalanceCents, 120000);
  records.push({ _id: id(), stage: 'downpayment', amountCents: 20000, status: 'verified' });
  records.push({ _id: id(), stage: 'final', amountCents: 100000, method: 'gcash', reference: 'G123', status: 'submitted' });
  result = await payments.summary(bookingId, client);
  assert.equal(result.downpaymentPaidCents, 20000);
  assert.equal(result.paymentStatus, 'pending_verification');
  assert.equal(result.payments.at(-1).reference, 'G123');
  records[1].status = 'verified'; records[1].verifiedBy = staffId;
  records[1].verifiedByRole = 'staff'; records[1].verifiedAt = new Date();
  result = await payments.summary(bookingId, client);
  assert.equal(result.paymentStatus, 'paid');
  assert.equal(result.totalPaidCents, 120000);
  assert.equal(result.remainingBalanceCents, 0);
  assert.equal(result.payments.at(-1).verifiedBy, staffId);
  await assert.rejects(payments.summary(bookingId, { role: 'client', _id: id() }), { status: 404 });
});

test('release reasons distinguish missing, pending, rejected and short-paid transactions', () => {
  const base = { remainingBalanceCents: 1000, paymentStatus: 'final_payment_due', payments: [] };
  assert.match(payments.releaseReason(base), /not yet been submitted/);
  assert.match(payments.releaseReason({ ...base, paymentStatus: 'pending_verification', payments: [{ stage: 'final' }] }), /awaiting verification/);
  assert.match(payments.releaseReason({ ...base, paymentStatus: 'rejected', payments: [{ stage: 'final' }] }), /rejected/);
  assert.match(payments.releaseReason({ ...base, payments: [{ stage: 'final', status: 'verified' }] }), /Full payment/);
  assert.equal(payments.releaseReason({ ...base, remainingBalanceCents: 0, paymentStatus: 'paid',
    payments: [{ stage: 'final', status: 'verified' }] }), null);
});

test('final payment submission is stage-bound, unverified and rejects client-supplied verification fields', async t => {
  const records = [];
  let status = 'confirmed'; let created; let bookingWrites = 0;
  t.mock.method(mongoose.connection, 'transaction', callback => callback({}));
  t.mock.method(Booking, 'findById', () => ({ select: () => {
    const query = { lean: async () => ({ _id: bookingId, client: clientId, services: [id()],
      status, finalTotalCents: 100000 }) };
    query.session = () => query; return query;
  } }));
  t.mock.method(Payment, 'find', () => ({ sort: () => {
    const query = { lean: async () => records }; query.session = () => query; return query;
  } }));
  t.mock.method(Payment, 'create', async documents => {
    created = { _id: id(), ...documents[0], createdAt: new Date() }; records.push(created); return [created];
  });
  t.mock.method(Booking, 'updateOne', async () => { bookingWrites++; return { modifiedCount: 1 }; });
  t.mock.method(engagement, 'recordNotification', async () => {});
  t.mock.method(User, 'find', () => ({ select: () => ({ session: () => ({ lean: async () => [] }) }) }));
  const body = { stage: 'final', amount: 1000, method: 'gcash', reference: 'G123' };
  await assert.rejects(payments.submit(bookingId, client, body), { status: 409 });
  await assert.rejects(payments.submit(bookingId, client, { ...body, paymentStatus: 'paid' }), { status: 400 });
  assert.equal(records.length, 0);
  status = 'ready_for_release';
  const result = await payments.submit(bookingId, client, body);
  assert.equal(created.status, 'submitted');
  assert.equal(created.client, clientId);
  assert.equal(result.paymentStatus, 'pending_verification');
  assert.equal(bookingWrites, 1);
  assert.equal(status, 'ready_for_release');
  await assert.rejects(payments.submit(bookingId, client, body), { status: 409 });
});

test('client cannot verify; Staff and Admin verification records actor and never completes booking', async t => {
  const paymentId = id();
  const record = { _id: paymentId, booking: bookingId, stage: 'final', status: 'submitted', amountCents: 100000,
    method: 'gcash', reference: 'G123', createdAt: new Date() };
  let bookingStatus = 'ready_for_release'; let decision; let bookingUpdates = 0;
  t.mock.method(mongoose.connection, 'transaction', callback => callback({}));
  t.mock.method(Booking, 'findById', () => ({ select: () => {
    const query = { lean: async () => ({ _id: bookingId, client: clientId, services: [id()],
      status: bookingStatus, finalTotalCents: 100000 }) };
    query.session = () => query;
    return query;
  } }));
  t.mock.method(Payment, 'findOne', () => ({ session: () => ({ lean: async () => record.status === 'submitted' ? record : null }) }));
  t.mock.method(Payment, 'find', () => ({ sort: () => ({ session: () => ({ lean: async () => [record] }),
    lean: async () => [record] }) }));
  t.mock.method(Payment, 'updateOne', async (_filter, update) => {
    decision = update.$set; Object.assign(record, decision); return { modifiedCount: 1 };
  });
  t.mock.method(Booking, 'updateOne', async () => { bookingUpdates++; return { modifiedCount: 1 }; });
  t.mock.method(engagement, 'recordNotification', async () => {});
  await assert.rejects(payments.decide(bookingId, paymentId, client, 'verify'), { status: 403 });
  assert.equal(decision, undefined);
  const result = await payments.decide(bookingId, paymentId, staff, 'verify');
  assert.equal(decision.verifiedBy, staffId);
  assert.equal(decision.verifiedByRole, 'staff');
  assert.ok(decision.verifiedAt instanceof Date);
  assert.equal(result.paymentStatus, 'paid');
  assert.equal(bookingStatus, 'ready_for_release');
  assert.equal(bookingUpdates, 1);
  await assert.rejects(payments.decide(bookingId, paymentId, admin, 'verify'), { status: 409 });
});

test('backend completion rejects missing, pending, rejected and short-paid summaries; fully paid Staff/Admin release is audited', async t => {
  const jobId = id(); const mechanicId = id(); const bayId = id();
  const now = new Date(Date.now() - 60000);
  let state = 'ready_for_release'; let jobStatus = 'in_progress'; let bookingWrite = 0; let releaseUpdate;
  let snapshot = { finalTotalCents: 100000, remainingBalanceCents: 100000, paymentStatus: 'final_payment_due', payments: [] };
  t.mock.method(mongoose.connection, 'transaction', callback => callback({}));
  t.mock.method(JobOrder, 'findOne', filter => filter.status ? { session: () => ({ lean: async () => jobStatus === filter.status
    ? { _id: jobId, booking: bookingId, mechanic: mechanicId, serviceBay: bayId, startedAt: now } : null }) }
    : { populate: () => ({ lean: async () => ({ _id: jobId, status: jobStatus, booking: { status: state } }) }) });
  t.mock.method(Booking, 'findById', () => ({ select: () => ({ session: () => ({ lean: async () => ({ _id: bookingId,
    status: state, finalTotalCents: 100000, client: clientId, services: [id()] }) }) }) }));
  t.mock.method(payments, 'calculate', async () => snapshot);
  t.mock.method(Booking, 'findOneAndUpdate', async (_filter, update) => {
    bookingWrite++; releaseUpdate = update; state = update.$set.status;
    return { _id: bookingId, client: clientId, vehicle: id(), services: [] };
  });
  t.mock.method(JobOrder, 'findOneAndUpdate', async () => { jobStatus = 'completed'; return {}; });
  t.mock.method(User, 'updateOne', async () => ({}));
  t.mock.method(ServiceBay, 'updateOne', async () => ({}));
  t.mock.method(engagement, 'updateReminders', async () => {});
  t.mock.method(engagement, 'recordBookingEvent', async () => {});
  for (const variant of [
    snapshot,
    { ...snapshot, paymentStatus: 'pending_verification', payments: [{ stage: 'final', status: 'submitted' }] },
    { ...snapshot, paymentStatus: 'rejected', payments: [{ stage: 'final', status: 'rejected' }] },
    { ...snapshot, paymentStatus: 'final_payment_due', remainingBalanceCents: 100,
      payments: [{ stage: 'final', status: 'verified' }] },
  ]) {
    snapshot = variant;
    await assert.rejects(jobs.transition(jobId, staff, 'complete'), { status: 409 });
    assert.equal(bookingWrite, 0);
  }
  snapshot = { ...snapshot, remainingBalanceCents: 0, paymentStatus: 'paid',
    payments: [{ stage: 'final', status: 'verified' }] };
  await jobs.transition(jobId, admin, 'complete');
  assert.equal(state, 'completed');
  assert.equal(releaseUpdate.$set.releasedBy, adminId);
  assert.equal(releaseUpdate.$set.releasedByRole, 'admin');
  assert.ok(releaseUpdate.$set.releasedAt instanceof Date);
  assert.equal(releaseUpdate.$push.activity.performedByRole, 'admin');
});
