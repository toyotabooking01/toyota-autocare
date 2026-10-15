const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Work = require('../models/AdditionalWorkRequest');
const Booking = require('../models/Booking');
const JobOrder = require('../models/JobOrder');
const Service = require('../models/Service');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const cloudinary = require('../services/cloudinaryService');
const engagement = require('../services/engagementService');
const work = require('../services/additionalWorkService');

const id = () => String(new mongoose.Types.ObjectId());
const query = value => ({ select() { return this; }, session() { return this; },
  sort() { return this; }, lean: async () => value });
const proposal = () => ({ issueTitle: 'Worn front brake pads',
  issueDescription: 'Front brake pads are below the recommended safe thickness.',
  items: [{ kind: 'part', name: 'Front Brake Pad Set', quantity: '1' }] });
const quote = () => ({ items: [{ name: 'Front Brake Pad Set', description: 'Front axle', quantity: '1', unitPrice: '2500.00' }] });

function fixture(t, { failCreate = false } = {}) {
  const ids = { booking: id(), job: id(), client: id(), mechanic: id(), staff: id(), admin: id(),
    other: id(), vehicle: id(), service: id() };
  let state = { booking: { _id: ids.booking, client: ids.client, vehicle: ids.vehicle,
    assignedMechanic: ids.mechanic, status: 'in_service' },
  job: { _id: ids.job, booking: ids.booking, mechanic: ids.mechanic, status: 'in_progress' },
  work: null, notifications: [], uploads: 0, deletes: 0, bookingWrites: 0 };
  t.mock.method(mongoose.connection, 'transaction', async callback => {
    const before = structuredClone(state);
    try { return await callback({}); } catch (error) { state = before; throw error; }
  });
  t.mock.method(JobOrder, 'findOne', filter => query(state.job.status === filter.status ? { ...state.job } : null));
  t.mock.method(JobOrder, 'findById', () => query({ ...state.job }));
  t.mock.method(Booking, 'findOne', filter => query(state.booking.status === filter.status ? { ...state.booking } : null));
  t.mock.method(Booking, 'findById', () => query({ ...state.booking }));
  t.mock.method(Booking, 'updateOne', async filter => {
    if (state.booking.status !== filter.status) return { matchedCount: 0 };
    state.bookingWrites++; return { matchedCount: 1 };
  });
  t.mock.method(Service, 'find', () => query([{ _id: ids.service, name: 'Brake Service', estimatedPrice: 1000 }]));
  t.mock.method(Vehicle, 'findById', () => query({ make: 'Toyota', model: 'Vios', plateNumber: 'ABC1234' }));
  t.mock.method(User, 'find', () => query([{ _id: ids.staff, role: 'staff' }, { _id: ids.admin, role: 'admin' }]));
  t.mock.method(Work, 'findById', () => query(state.work ? { ...state.work } : null));
  t.mock.method(Work, 'create', async ([record]) => {
    if (failCreate) throw new Error('Database insert failed');
    state.work = { ...record, _id: id(), createdAt: new Date() };
    return [state.work];
  });
  t.mock.method(Work, 'findOneAndUpdate', (filter, update) => query((() => {
    if (!state.work || state.work.status !== filter.status) return null;
    Object.assign(state.work, update.$set);
    state.work.activity.push(...update.$push.activity.$each);
    return { ...state.work };
  })()));
  t.mock.method(Work, 'find', filter => query(state.work && (!filter.status || filter.status === state.work.status)
    && (!filter.clientDecision || filter.clientDecision === state.work.clientDecision)
    && (!filter.approvedTotalCents || state.work.approvedTotalCents > 0) ? [{ ...state.work }] : []));
  t.mock.method(Work, 'exists', filter => {
    const result = Promise.resolve(state.work && filter.status.$in.includes(state.work.status) ? { _id: state.work._id } : null);
    result.session = () => result;
    return result;
  });
  t.mock.method(cloudinary, 'uploadImage', async (_buffer, uploadType) => {
    assert.equal(uploadType, 'additional-service-evidence');
    state.uploads++; return { secureUrl: 'https://example.invalid/evidence.png', publicId: 'new-evidence',
      width: 20, height: 20, format: 'png', bytes: 10 };
  });
  t.mock.method(cloudinary, 'deleteAsset', async () => { state.deletes++; });
  t.mock.method(engagement, 'recordNotification', async (_session, note) => state.notifications.push(note));
  return { ids, state: () => state, actor: role => ({ _id: ids[role] || ids.other, role }) };
}

test('assigned Mechanic creates unpriced proposal with evidence', async t => {
  const f = fixture(t);
  const result = await work.create(f.ids.job, f.actor('mechanic'), proposal(),
    { buffer: Buffer.from('image'), mimetype: 'image/png' });
  assert.equal(result.status, 'pending_staff_review');
  assert.equal(result.originalProposalItems[0].lineTotalCents, undefined);
  assert.equal(result.originalProposalTotalCents, undefined);
  assert.equal(result.evidenceImage.publicId, undefined);
  assert.equal(f.state().uploads, 1);
  assert.equal(f.state().notifications.length, 2);
  assert.match(f.state().notifications[0].message, /Toyota Vios ABC1234/);
  assert.equal(f.state().booking.assignedMechanic, f.ids.mechanic);
  assert.equal(f.state().work.activity[0].actorRole, 'mechanic');
});

test('Admin creates as Admin without reassigning; other Mechanic, Staff and Client cannot create', async t => {
  const f = fixture(t);
  for (const actor of [{ _id: f.ids.other, role: 'mechanic' }, f.actor('staff'), f.actor('client')])
    await assert.rejects(work.create(f.ids.job, actor, proposal()), { status: actor.role === 'mechanic' ? 404 : 403 });
  await work.create(f.ids.job, f.actor('admin'), proposal());
  assert.equal(f.state().work.proposedByRole, 'admin');
  assert.equal(f.state().work.assignedMechanic, f.ids.mechanic);
  assert.equal(f.state().booking.assignedMechanic, f.ids.mechanic);
});

test('creation requires in-service booking and active job; forged prices and totals fail', async t => {
  const f = fixture(t);
  f.state().booking.status = 'mechanic_assigned';
  await assert.rejects(work.create(f.ids.job, f.actor('mechanic'), proposal()), { status: 409 });
  f.state().booking.status = 'in_service'; f.state().job.status = 'completed';
  await assert.rejects(work.create(f.ids.job, f.actor('mechanic'), proposal()), { status: 404 });
  f.state().job.status = 'in_progress';
  for (const bad of [
    { ...proposal(), issueTitle: '  ' },
    { ...proposal(), issueDescription: 'short' },
    { ...proposal(), items: [{ kind: 'part', name: 'Pad', quantity: 0 }] },
    { ...proposal(), items: [{ kind: 'part', name: 'Pad', quantity: 1, unitPrice: '-2.00' }] },
    { ...proposal(), items: [{ kind: 'part', name: 'Pad', quantity: 1, unitPriceCents: 200 }] },
    { ...proposal(), items: [{ kind: 'part', name: 'Pad', quantity: 1, approvedTotalCents: 200 }] },
    { ...proposal(), quoteTotalCents: 1 },
    { ...proposal(), items: [{ ...proposal().items[0], lineTotalCents: 1 }] },
  ]) await assert.rejects(work.create(f.ids.job, f.actor('mechanic'), bad), { status: 400 });
});

test('service proposal snapshots catalog name without price; optional evidence failure cleans upload', async t => {
  const f = fixture(t, { failCreate: true });
  const raw = { ...proposal(), items: [{ kind: 'service', serviceId: f.ids.service, quantity: 2 }] };
  await assert.rejects(work.create(f.ids.job, f.actor('mechanic'), raw,
    { buffer: Buffer.from('image'), mimetype: 'image/png' }), /Database insert failed/);
  assert.equal(f.state().deletes, 1);
  assert.equal(f.state().work, null);
  assert.equal(f.state().notifications.length, 0);
  assert.equal(f.state().bookingWrites, 0);
  const items = await work.proposalItems(raw.items, {});
  assert.equal(items[0].name, 'Brake Service');
  assert.equal(items[0].unitPriceCents, undefined);
  assert.equal(items[0].lineTotalCents, undefined);
});

test('invalid evidence MIME is rejected before upload', async t => {
  const f = fixture(t);
  await assert.rejects(work.create(f.ids.job, f.actor('mechanic'), proposal(),
    { buffer: Buffer.from('bad'), mimetype: 'application/pdf' }), { status: 400 });
  assert.equal(f.state().uploads, 0);
});

test('Staff quote preserves proposal, locks price after sending, Client approves exact snapshot once', async t => {
  const f = fixture(t);
  await work.create(f.ids.job, f.actor('mechanic'), proposal());
  await assert.rejects(work.mutate(f.state().work._id, f.actor('mechanic'), 'send', quote()), { status: 403 });
  await assert.rejects(work.mutate(f.state().work._id, f.actor('client'), 'send', quote()), { status: 403 });
  await assert.rejects(work.mutate(f.state().work._id, f.actor('staff'), 'send', { ...quote(), quoteTotalCents: 1 }), { status: 400 });
  await work.mutate(f.state().work._id, f.actor('staff'), 'send', quote());
  assert.equal(f.state().work.originalProposalTotalCents, undefined);
  assert.equal(f.state().work.quoteTotalCents, 250000);
  assert.equal(f.state().work.status, 'pending_client_approval');
  assert.equal(f.state().work.reviewedByRole, 'staff');
  assert.deepEqual(f.state().work.activity.slice(-2).map(entry => entry.action), ['staff_reviewed', 'sent_to_client']);
  assert.equal(f.state().notifications.filter(note => note.title === 'Additional work approval required').length, 1);
  await assert.rejects(work.mutate(f.state().work._id, f.actor('admin'), 'send', quote()), { status: 409 });
  await assert.rejects(work.mutate(f.state().work._id, { _id: f.ids.other, role: 'client' }, 'approve'), { status: 404 });
  await assert.rejects(work.mutate(f.state().work._id, f.actor('client'), 'approve', { approvedTotalCents: 1 }), { status: 400 });
  await work.mutate(f.state().work._id, f.actor('client'), 'approve');
  assert.equal(f.state().work.approvedTotalCents, 250000);
  assert.equal(f.state().work.approvedItems[0].lineTotalCents, 250000);
  assert.equal(f.state().work.activity.at(-1).actorRole, 'client');
  const count = f.state().notifications.length;
  await work.mutate(f.state().work._id, f.actor('client'), 'approve');
  assert.equal(f.state().notifications.length, count);
  await assert.rejects(work.mutate(f.state().work._id, f.actor('client'), 'decline'), { status: 409 });
  assert.equal(f.state().booking.finalTotalCents, undefined);
});

test('Client decline is idempotent, remains non-billable, and cannot be performed', async t => {
  const f = fixture(t);
  await work.create(f.ids.job, f.actor('admin'), proposal());
  await work.mutate(f.state().work._id, f.actor('admin'), 'send', quote());
  await work.mutate(f.state().work._id, f.actor('client'), 'decline', { reason: 'Not now' });
  assert.equal(f.state().work.status, 'declined');
  assert.equal(f.state().work.declineReason, 'Not now');
  const count = f.state().notifications.length;
  await work.mutate(f.state().work._id, f.actor('client'), 'decline');
  assert.equal(f.state().notifications.length, count);
  await assert.rejects(work.mutate(f.state().work._id, f.actor('client'), 'approve'), { status: 409 });
  await assert.rejects(work.mutate(f.state().work._id, f.actor('mechanic'), 'perform'), { status: 409 });
  assert.deepEqual(await work.getBillableAdditionalWork(f.ids.booking), []);
});

test('assigned Mechanic or Admin can perform approved work; Staff cannot; only performed is billable', async t => {
  const f = fixture(t);
  await work.create(f.ids.job, f.actor('mechanic'), proposal());
  await work.mutate(f.state().work._id, f.actor('admin'), 'send', quote());
  await work.mutate(f.state().work._id, f.actor('client'), 'approve');
  assert.deepEqual(await work.getBillableAdditionalWork(f.ids.booking), []);
  await assert.rejects(work.mutate(f.state().work._id, f.actor('staff'), 'perform'), { status: 403 });
  await assert.rejects(work.mutate(f.state().work._id, f.actor('client'), 'perform'), { status: 403 });
  await assert.rejects(work.mutate(f.state().work._id, { _id: f.ids.other, role: 'mechanic' }, 'perform'), { status: 404 });
  await work.mutate(f.state().work._id, f.actor('admin'), 'perform');
  assert.equal(f.state().work.status, 'performed');
  assert.equal(f.state().work.performedByRole, 'admin');
  assert.equal(f.state().booking.assignedMechanic, f.ids.mechanic);
  assert.equal(f.state().booking.finalTotalCents, undefined);
  assert.equal((await work.getBillableAdditionalWork(f.ids.booking)).length, 1);
  const count = f.state().notifications.length;
  await work.mutate(f.state().work._id, f.actor('admin'), 'perform');
  assert.equal(f.state().notifications.length, count);
});

test('unresolved statuses gate final inspection; terminal statuses allow it', async t => {
  const f = fixture(t);
  assert.equal(await work.hasUnresolved(f.ids.booking), false);
  await work.create(f.ids.job, f.actor('mechanic'), proposal());
  assert.equal(await work.hasUnresolved(f.ids.booking), true);
  await work.mutate(f.state().work._id, f.actor('staff'), 'send', quote());
  assert.equal(await work.hasUnresolved(f.ids.booking), true);
  await work.mutate(f.state().work._id, f.actor('client'), 'approve');
  assert.equal(await work.hasUnresolved(f.ids.booking), true);
  await work.mutate(f.state().work._id, f.actor('mechanic'), 'perform');
  assert.equal(await work.hasUnresolved(f.ids.booking), false);
});

test('request reads are scoped to booking owner or assigned Mechanic', async t => {
  const f = fixture(t);
  await work.create(f.ids.job, f.actor('mechanic'), proposal());
  assert.equal((await work.list(f.ids.booking, f.actor('client'))).length, 0);
  await assert.rejects(work.get(f.state().work._id, f.actor('client')), { status: 404 });
  assert.equal((await work.list(f.ids.booking, f.actor('staff'))).length, 1);
  await assert.rejects(work.list(f.ids.booking, { _id: f.ids.other, role: 'client' }), { status: 404 });
  await assert.rejects(work.list(f.ids.booking, { _id: f.ids.other, role: 'mechanic' }), { status: 404 });
  await assert.rejects(work.get(f.state().work._id, { _id: f.ids.other, role: 'client' }), { status: 404 });
  await work.mutate(f.state().work._id, f.actor('staff'), 'send', quote());
  const clientItem = await work.get(f.state().work._id, f.actor('client'));
  assert.equal(clientItem.evidenceImage, null);
  assert.equal(clientItem.originalProposalItems, undefined);
});

test('Staff rejection and controlled cancellation preserve non-billable history', async t => {
  const f = fixture(t);
  await work.create(f.ids.job, f.actor('mechanic'), proposal());
  await work.mutate(f.state().work._id, f.actor('staff'), 'reject');
  assert.equal(f.state().work.status, 'staff_rejected');
  assert.equal(f.state().work.activity.at(-1).actorRole, 'staff');
  assert.equal(await work.hasUnresolved(f.ids.booking), false);
  assert.deepEqual(await work.getBillableAdditionalWork(f.ids.booking), []);
  await assert.rejects(work.mutate(f.state().work._id, f.actor('client'), 'approve'), { status: 404 });
  f.state().work = null;
  await work.create(f.ids.job, f.actor('mechanic'), proposal());
  await work.mutate(f.state().work._id, f.actor('admin'), 'send', quote());
  await work.mutate(f.state().work._id, f.actor('admin'), 'cancel');
  assert.equal(f.state().work.status, 'cancelled');
  assert.equal(await work.hasUnresolved(f.ids.booking), false);
  assert.deepEqual(await work.getBillableAdditionalWork(f.ids.booking), []);
});
