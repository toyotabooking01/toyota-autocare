const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Schedule = require('../models/Schedule');
const Vehicle = require('../models/Vehicle');
const Service = require('../models/Service');
const bookings = require('../services/bookingService');
const schedules = require('../services/scheduleService');
const engagement = require('../services/engagementService');
const originalRecordEvent = engagement.recordBookingEvent;
before(() => { engagement.recordBookingEvent = async () => {}; });
after(() => { engagement.recordBookingEvent = originalRecordEvent; });

const id = () => new mongoose.Types.ObjectId();
const future = { date: '2035-05-12', timeSlot: '09:00', maximumCapacity: 2, currentBookingCount: 0, isEnabled: true };
const sample = () => ({ vehicle: String(id()), services: [String(id()), String(id())], schedule: String(id()) });

test('booking input accepts multiple services and rejects duplicates or claimed owner', () => {
  const input = sample();
  assert.equal(bookings.input(input).services.length, 2);
  assert.throws(() => bookings.input({ ...input, services: [input.services[0], input.services[0]] }), { status: 400 });
  assert.throws(() => bookings.input({ ...input, services: [] }), { status: 400 });
  assert.throws(() => bookings.input({ ...input, client: String(id()) }), { status: 400 });
});

test('schedule validates capacity, date and time', () => {
  assert.equal(schedules.input({ date: future.date, timeSlot: future.timeSlot, maximumCapacity: 3 }, true).maximumCapacity, 3);
  assert.throws(() => schedules.input({ date: future.date, timeSlot: future.timeSlot, maximumCapacity: 0 }, true), { status: 400 });
  assert.throws(() => schedules.input({ date: '2035-02-30', timeSlot: future.timeSlot, maximumCapacity: 1 }, true), { status: 400 });
  assert.throws(() => schedules.input({ date: future.date, timeSlot: '25:00', maximumCapacity: 1 }, true), { status: 400 });
});

test('available schedules exclude past slots even when a database query returns them', async () => {
  const oldFind = Schedule.find;
  Schedule.find = () => ({ sort: () => ({ lean: async () => [
    { date: '2000-01-01', timeSlot: '09:00' }, { ...future },
  ] }) });
  try {
    const available = await schedules.available();
    assert.equal(available.length, 1);
    assert.equal(available[0].date, future.date);
  } finally { Schedule.find = oldFind; }
});

test('capacity reduction is conditional on the current reserved count', async () => {
  const oldFind = Schedule.findById;
  const oldUpdate = Schedule.findOneAndUpdate;
  let filter;
  Schedule.findById = () => ({ lean: async () => ({ ...future, currentBookingCount: 2 }) });
  Schedule.findOneAndUpdate = async query => { filter = query; return null; };
  try {
    await assert.rejects(schedules.update(String(id()), { maximumCapacity: 1 }), { status: 409 });
    assert.deepEqual(filter.currentBookingCount, { $lte: 1 });
    await assert.rejects(schedules.update(String(id()), { date: '2035-05-13' }), { status: 409 });
  } finally { Schedule.findById = oldFind; Schedule.findOneAndUpdate = oldUpdate; }
});

test('booking admission validates ownership, services and atomic capacity before insert', async () => {
  const oldTransaction = mongoose.connection.transaction;
  const oldVehicle = Vehicle.exists;
  const oldService = Service.countDocuments;
  const oldSchedule = Schedule.findById;
  const oldReserve = Schedule.findOneAndUpdate;
  const oldCreate = Booking.create;
  const oldFind = Booking.findOne;
  const client = id();
  const body = sample();
  let owned = true; let activeServices = 2; let seats = 1; let inserts = 0; let reserveFilter;
  mongoose.connection.transaction = async fn => fn({});
  Vehicle.exists = query => ({ session: async () => query.owner.equals(client) && owned ? { _id: body.vehicle } : null });
  Service.countDocuments = () => ({ session: async () => activeServices });
  Schedule.findById = () => ({ session: () => ({ lean: async () => ({ ...future, maximumCapacity: 1 }) }) });
  Schedule.findOneAndUpdate = async query => { reserveFilter = query; return seats-- > 0 ? { ...future } : null; };
  Booking.create = async records => { inserts++; return [{ _id: id(), ...records[0] }]; };
  Booking.findOne = () => ({ populate: () => ({ lean: async () => ({ _id: id() }) }) });
  try {
    owned = false;
    await assert.rejects(bookings.create(client, body), { status: 400 });
    owned = true; activeServices = 1;
    await assert.rejects(bookings.create(client, body), { status: 400 });
    activeServices = 2;
    await bookings.create(client, body);
    assert.equal(reserveFilter.$expr.$lt[0], '$currentBookingCount');
    assert.equal(inserts, 1);
    await assert.rejects(bookings.create(client, body), { status: 409 });
    assert.equal(inserts, 1);
  } finally {
    mongoose.connection.transaction = oldTransaction; Vehicle.exists = oldVehicle;
    Service.countDocuments = oldService; Schedule.findById = oldSchedule;
    Schedule.findOneAndUpdate = oldReserve; Booking.create = oldCreate; Booking.findOne = oldFind;
  }
});

test('failed booking insert aborts the capacity reservation transaction', async () => {
  const oldTransaction = mongoose.connection.transaction;
  const oldVehicle = Vehicle.exists;
  const oldService = Service.countDocuments;
  const oldSchedule = Schedule.findById;
  const oldReserve = Schedule.findOneAndUpdate;
  const oldCreate = Booking.create;
  const body = sample();
  let reserved = 0;
  mongoose.connection.transaction = async fn => { try { return await fn({}); } catch (error) { reserved = 0; throw error; } };
  Vehicle.exists = () => ({ session: async () => ({ _id: body.vehicle }) });
  Service.countDocuments = () => ({ session: async () => 2 });
  Schedule.findById = () => ({ session: () => ({ lean: async () => ({ ...future }) }) });
  Schedule.findOneAndUpdate = async () => { reserved++; return future; };
  Booking.create = async () => { throw new Error('Simulated insert failure'); };
  try {
    await assert.rejects(bookings.create(id(), body), /Simulated insert failure/);
    assert.equal(reserved, 0);
  } finally {
    mongoose.connection.transaction = oldTransaction; Vehicle.exists = oldVehicle;
    Service.countDocuments = oldService; Schedule.findById = oldSchedule;
    Schedule.findOneAndUpdate = oldReserve; Booking.create = oldCreate;
  }
});

test('cancellation releases capacity once and blocks repeated requests', async () => {
  const oldTransaction = mongoose.connection.transaction;
  const oldUpdate = Booking.findOneAndUpdate;
  const oldFind = Booking.findOne;
  const oldRelease = Schedule.updateOne;
  const bookingId = id(); const slotId = id(); const owner = id();
  let status = 'pending'; let count = 1;
  mongoose.connection.transaction = async fn => fn({});
  Booking.findOneAndUpdate = async filter => {
    if (status !== 'pending' && status !== 'confirmed') return null;
    assert.equal(String(filter.client), String(owner));
    status = 'cancelled'; return { schedule: slotId };
  };
  Booking.findOne = filter => filter.status ? null : {
    session: () => ({ select: () => ({ lean: async () => ({ _id: bookingId }) }) }),
    populate: () => ({ lean: async () => ({ _id: bookingId, status }) }),
  };
  Schedule.updateOne = async filter => { if (count > 0 && filter.currentBookingCount.$gt === 0) { count--; return { modifiedCount: 1 }; } return { modifiedCount: 0 }; };
  try {
    await bookings.transition(String(bookingId), { role: 'client', _id: owner }, 'cancel');
    assert.equal(count, 0);
    await assert.rejects(bookings.transition(String(bookingId), { role: 'client', _id: owner }, 'cancel'), { status: 409 });
    assert.equal(count, 0);
  } finally { mongoose.connection.transaction = oldTransaction; Booking.findOneAndUpdate = oldUpdate; Booking.findOne = oldFind; Schedule.updateOne = oldRelease; }
});

test('admin confirms or rejects only pending bookings', async () => {
  const oldTransaction = mongoose.connection.transaction;
  const oldUpdate = Booking.findOneAndUpdate;
  const oldFind = Booking.findOne;
  const oldRelease = Schedule.updateOne;
  let status = 'pending'; let count = 1;
  mongoose.connection.transaction = async fn => fn({});
  Booking.findOneAndUpdate = async filter => {
    if (status !== 'pending' || filter.status !== 'pending') return null;
    status = 'confirmed'; return { schedule: id(), status };
  };
  Booking.findOne = () => ({ populate: () => ({ lean: async () => ({ status }) }),
    session: () => ({ select: () => ({ lean: async () => ({ _id: id() }) }) }) });
  Schedule.updateOne = async () => { count--; return { modifiedCount: 1 }; };
  try {
    await bookings.transition(String(id()), { role: 'admin' }, 'confirm');
    assert.equal(status, 'confirmed');
    await assert.rejects(bookings.transition(String(id()), { role: 'admin' }, 'confirm'), { status: 409 });
    status = 'pending';
    Booking.findOneAndUpdate = async filter => { if (status !== 'pending' || filter.status !== 'pending') return null; status = 'rejected'; return { schedule: id() }; };
    await bookings.transition(String(id()), { role: 'admin' }, 'reject');
    assert.equal(status, 'rejected'); assert.equal(count, 0);
    await assert.rejects(bookings.transition(String(id()), { role: 'admin' }, 'reject'), { status: 409 });
  } finally { mongoose.connection.transaction = oldTransaction; Booking.findOneAndUpdate = oldUpdate; Booking.findOne = oldFind; Schedule.updateOne = oldRelease; }
});

test('client booking lookup is always constrained by ownership', async () => {
  const oldFind = Booking.findOne;
  let filter;
  Booking.findOne = query => { filter = query; return { populate: () => ({ lean: async () => null }) }; };
  const owner = id();
  try {
    await assert.rejects(bookings.get(String(id()), owner), { status: 404 });
    assert.equal(String(filter.client), String(owner));
  } finally { Booking.findOne = oldFind; }
});

test('client booking list includes ownership in its database filter', async () => {
  const oldFind = Booking.find;
  let filter;
  Booking.find = query => { filter = query; return { sort: () => ({ populate: () => ({ lean: async () => [] }) }) }; };
  const owner = id();
  try {
    await bookings.list({ status: 'pending' }, owner);
    assert.equal(String(filter.client), String(owner));
    assert.equal(filter.status, 'pending');
  } finally { Booking.find = oldFind; }
});
