const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const MaintenanceReminder = require('../models/MaintenanceReminder');
const Service = require('../models/Service');
const Booking = require('../models/Booking');
const User = require('../models/User');
const engagement = require('../services/engagementService');
const bookings = require('../services/bookingService');

const id = () => String(new mongoose.Types.ObjectId());

test('booking events use a stable unique key and the transaction session', async () => {
  const oldUpdate = Notification.updateOne;
  const oldStaff = User.find;
  const calls = []; const session = {}; const booking = { _id: id(), client: id() };
  Notification.updateOne = async (...args) => { calls.push(args); return { upsertedCount: 1 }; };
  User.find = () => ({ select: () => ({ session: () => ({ lean: async () => [] }) }) });
  try {
    await engagement.recordBookingEvent(session, booking, 'confirmed');
    await engagement.recordBookingEvent(session, booking, 'confirmed');
    await engagement.recordBookingEvent(session, booking, 'checked_in');
    assert.equal(calls[0][0].eventKey, `${booking._id}:confirmed`);
    assert.equal(calls[0][2].upsert, true); assert.equal(calls[0][2].session, session);
    assert.equal(String(calls[0][1].$setOnInsert.user), booking.client);
    assert.equal(calls[0][1].$setOnInsert.title, 'Booking confirmed');
    assert.equal(calls[1][0].eventKey, calls[0][0].eventKey);
    assert.notEqual(calls[2][0].eventKey, calls[0][0].eventKey);
    assert.ok(Notification.schema.indexes().some(([fields, options]) => fields.eventKey === 1 && options.unique));
  } finally { Notification.updateOne = oldUpdate; User.find = oldStaff; }
});

test('completion uses each configured interval and disables stale reminders for null intervals', async () => {
  const oldFind = Service.find; const oldUpsert = MaintenanceReminder.findOneAndUpdate;
  const oldUpdate = MaintenanceReminder.updateOne;
  const serviceA = id(); const serviceB = id(); const session = {};
  const upserts = []; const disabled = [];
  Service.find = () => ({ select: () => ({ session: () => ({ lean: async () => [
    { _id: serviceA, maintenanceReminderInterval: 45 },
    { _id: serviceB, maintenanceReminderInterval: null },
  ] }) }) });
  MaintenanceReminder.findOneAndUpdate = async (...args) => { upserts.push(args); return {}; };
  MaintenanceReminder.updateOne = async (...args) => { disabled.push(args); return {}; };
  try {
    const completedAt = new Date('2026-10-07T10:00:00.000Z');
    const booking = { client: id(), vehicle: id(), services: [serviceA, serviceB] };
    await engagement.updateReminders(session, booking, completedAt);
    assert.equal(upserts.length, 1); assert.equal(disabled.length, 1);
    assert.equal(String(upserts[0][0].service), serviceA);
    assert.equal(upserts[0][1].$set.lastServiceDate, completedAt);
    assert.equal(upserts[0][1].$set.nextRecommendedServiceDate.toISOString(), '2026-11-21T10:00:00.000Z');
    assert.equal(upserts[0][2].upsert, true); assert.equal(upserts[0][2].session, session);
    assert.equal(String(disabled[0][0].service), serviceB);
    assert.equal(disabled[0][1].$set.status, 'completed');
    assert.ok(MaintenanceReminder.schema.indexes().some(([fields, options]) =>
      fields.client === 1 && fields.vehicle === 1 && fields.service === 1 && options.unique));
  } finally {
    Service.find = oldFind; MaintenanceReminder.findOneAndUpdate = oldUpsert;
    MaintenanceReminder.updateOne = oldUpdate;
  }
});

test('notification and reminder reads and mutations are owner-scoped', async () => {
  const oldFind = Notification.find; const oldCount = Notification.countDocuments;
  const oldOne = Notification.findOneAndUpdate; const oldMany = Notification.updateMany;
  const oldReminders = MaintenanceReminder.find;
  const owner = id(); let listFilter; let countFilter; let oneFilter; let manyFilter; let reminderFilter;
  Notification.find = filter => { listFilter = filter; return { select: () => ({ sort: () => ({ lean: async () => [] }) }) }; };
  Notification.countDocuments = async filter => { countFilter = filter; return 2; };
  Notification.findOneAndUpdate = async filter => { oneFilter = filter; return null; };
  Notification.updateMany = async filter => { manyFilter = filter; return { modifiedCount: 2 }; };
  MaintenanceReminder.find = filter => { reminderFilter = filter; return { sort: () => ({ populate: () => ({ lean: async () => [] }) }) }; };
  try {
    await engagement.notifications(owner);
    assert.equal(listFilter.user, owner);
    assert.equal(await engagement.unreadCount(owner), 2);
    assert.deepEqual(countFilter, { user: owner, isRead: false });
    await assert.rejects(engagement.markRead(owner, id()), { status: 404 });
    assert.equal(oneFilter.user, owner);
    assert.equal((await engagement.markAllRead(owner)).updated, 2);
    assert.equal(manyFilter.user, owner);
    await engagement.reminders(owner);
    assert.equal(reminderFilter.client, owner);
    await engagement.reminders();
    assert.deepEqual(reminderFilter, {});
  } finally {
    Notification.find = oldFind; Notification.countDocuments = oldCount;
    Notification.findOneAndUpdate = oldOne; Notification.updateMany = oldMany;
    MaintenanceReminder.find = oldReminders;
  }
});

test('notification write failure aborts booking confirmation', async () => {
  const original = { transaction: mongoose.connection.transaction, booking: Booking.findOneAndUpdate,
    notification: Notification.updateOne };
  const bookingId = id(); const client = id(); let status = 'pending';
  mongoose.connection.transaction = async callback => {
    try { await callback({}); } catch (error) { status = 'pending'; throw error; }
  };
  Booking.findOneAndUpdate = async (filter, update) => {
    assert.equal(filter.status, 'pending'); status = update.$set.status;
    return { _id: bookingId, client, status };
  };
  Notification.updateOne = async () => { throw new Error('Deliberate notification write failure'); };
  try {
    await assert.rejects(bookings.transition(bookingId, { role: 'staff' }, 'confirm'), /Deliberate notification write failure/);
    assert.equal(status, 'pending');
  } finally {
    mongoose.connection.transaction = original.transaction; Booking.findOneAndUpdate = original.booking;
    Notification.updateOne = original.notification;
  }
});

test('booking-to-release events reach only relevant recipients, remain separate, and deduplicate retries', async t => {
  const client = id(); const staff = id(); const mechanic = id(); const admin = id();
  const booking = { _id: id(), client, vehicle: id(), assignedMechanic: mechanic };
  const jobOrderId = id();
  const stored = new Map();
  t.mock.method(User, 'find', filter => {
    assert.equal(filter.role, 'staff');
    return { select: () => ({ session: () => ({ lean: async () => [{ _id: staff }] }) }) };
  });
  t.mock.method(Notification, 'updateOne', async (filter, update) => {
    if (!stored.has(filter.eventKey)) stored.set(filter.eventKey, { ...update.$setOnInsert, isRead: false });
    return { upsertedCount: 1 };
  });
  for (const status of ['created', 'confirmed', 'checked_in', 'mechanic_assigned', 'in_service',
    'final_inspection', 'ready_for_release', 'completed']) {
    await engagement.recordBookingEvent({}, booking, status, { jobOrderId });
  }
  await engagement.recordBookingEvent({}, booking, 'checked_in', { jobOrderId });
  const all = [...stored.values()];
  assert.equal(all.filter(item => String(item.user) === client).length, 8);
  assert.equal(all.filter(item => String(item.user) === staff).length, 5);
  assert.equal(all.filter(item => String(item.user) === mechanic).length, 1);
  assert.equal(all.filter(item => String(item.user) === admin).length, 0);
  assert.equal(all.find(item => item.title === 'Booking confirmed').message.includes('confirmed'), true);
  assert.equal(all.find(item => item.title === 'Vehicle checked in').message.includes('checked in'), true);
  assert.ok(all.every(item => String(item.bookingId) === booking._id));
  assert.ok(all.every(item => item.isRead === false));
});

test('maintenance due notifications have one event per reminder date and stage', async t => {
  const client = id(); const reminderId = id(); const vehicle = id();
  const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const stored = new Map();
  t.mock.method(MaintenanceReminder, 'find', () => ({ select: () => ({ lean: async () => [{
    _id: reminderId, client, vehicle, nextRecommendedServiceDate: new Date(`${today}T02:00:00Z`),
  }] }) }));
  t.mock.method(Notification, 'updateOne', async (filter, update) => {
    stored.set(filter.eventKey, update.$setOnInsert);
    return { upsertedCount: 1 };
  });
  await engagement.syncDueReminders({ _id: client, role: 'client' });
  await engagement.syncDueReminders({ _id: client, role: 'client' });
  assert.equal(stored.size, 1);
  assert.equal([...stored.values()][0].title, 'Maintenance due today');
  assert.equal([...stored.values()][0].maintenanceReminderId, reminderId);
});

test('Admin receives account and bay exceptions without credential details', async t => {
  const admin = id(); const staff = id(); const bay = id();
  const events = [];
  t.mock.method(User, 'find', filter => {
    assert.equal(filter.role, 'admin');
    return { select: () => ({ lean: async () => [{ _id: admin }] }) };
  });
  t.mock.method(Notification, 'updateOne', async (_filter, update) => {
    events.push(update.$setOnInsert);
    return { upsertedCount: 1 };
  });
  await engagement.recordAccountEvent({ _id: staff, role: 'staff', updatedAt: new Date() }, 'created');
  await engagement.recordBayProblem({ _id: bay, name: 'BAY 1', operationalStatus: 'out_of_service', updatedAt: new Date() });
  assert.equal(events.filter(event => String(event.user) === admin).length, 2);
  assert.equal(events.filter(event => String(event.user) === staff).length, 1);
  assert.ok(events.every(event => !/password|otp/i.test(`${event.title} ${event.message}`)));
  assert.equal(events.find(event => event.title === 'Service bay operational problem').path, '/admin/service-bays');
});

test('booking exceptions reach Client and Admin without notifying routine Staff', async t => {
  const client = id(); const admin = id(); const otherAdmin = id(); const booking = { _id: id(), client, vehicle: id() };
  const events = [];
  t.mock.method(User, 'find', filter => {
    assert.equal(filter.role, 'admin');
    return { select: () => ({ session: () => ({ lean: async () => [{ _id: admin }, { _id: otherAdmin }] }) }) };
  });
  t.mock.method(Notification, 'updateOne', async (_filter, update) => {
    events.push(update.$setOnInsert);
    return { upsertedCount: 1 };
  });
  await engagement.recordBookingEvent({}, booking, 'no_show');
  assert.deepEqual(events.map(event => String(event.user)), [client, admin, otherAdmin]);
  assert.equal(events[0].title, 'Booking marked No Show');
  assert.equal(events[1].title, 'Booking no-show');
  events.length = 0;
  await engagement.recordBookingEvent({}, booking, 'rejected', { actorRole: 'admin', actorId: admin });
  assert.deepEqual(events.map(event => String(event.user)), [client, otherAdmin]);
});
