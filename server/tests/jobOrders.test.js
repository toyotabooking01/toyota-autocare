const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const JobOrder = require('../models/JobOrder');
const Service = require('../models/Service');
const User = require('../models/User');
const ServiceBay = require('../models/ServiceBay');
const jobs = require('../services/jobOrderService');
const engagement = require('../services/engagementService');
const resourceAvailability = require('../services/resourceAvailabilityService');
const originalRecordEvent = engagement.recordBookingEvent;
const originalUpdateReminders = engagement.updateReminders;
before(() => { engagement.recordBookingEvent = async () => {}; });
after(() => { engagement.recordBookingEvent = originalRecordEvent; engagement.updateReminders = originalUpdateReminders; });

const id = () => String(new mongoose.Types.ObjectId());
const input = () => ({ mechanic: id(), serviceBay: id() });

test('assignment accepts only the selected resource IDs', () => {
  assert.deepEqual(Object.keys(jobs.assignmentInput(input())).sort(), ['mechanic', 'serviceBay']);
  assert.throws(() => jobs.assignmentInput({ ...input(), status: 'in_service' }), { status: 400 });
  assert.throws(() => jobs.assignmentInput({ mechanic: id() }), { status: 400 });
});

test('assignment options exclude ineligible resources and sensitive User fields', async () => {
  const oldUsers = User.find; const oldBays = ServiceBay.find;
  let mechanicFilter; let bayFilter;
  User.find = filter => { mechanicFilter = filter; return { select: () => ({ sort: () => ({ lean: async () => [
    { _id: id(), fullName: 'Mechanic', employeeId: 'M-1', password: 'hidden', authVersion: 2 },
  ] }) }) }; };
  ServiceBay.find = filter => { bayFilter = filter; return { select: () => ({ sort: () => ({ lean: async () => [
    { _id: id(), name: 'BAY 1', isArchived: false },
  ] }) }) }; };
  try {
    const result = await jobs.options();
    assert.deepEqual(mechanicFilter, { role: 'mechanic', status: 'active', isArchived: false, availability: 'available' });
    assert.deepEqual(bayFilter, { operationalStatus: 'operational', isArchived: false, availability: 'available' });
    assert.deepEqual(Object.keys(result.mechanics[0]).sort(), ['_id', 'availability', 'employeeId', 'fullName']);
    assert.deepEqual(Object.keys(result.serviceBays[0]).sort(), ['_id', 'name']);
  } finally { User.find = oldUsers; ServiceBay.find = oldBays; }
});

test('assignment claims checked-in booking, reserves eligible resources and creates one JobOrder', async () => {
  const originals = { transaction: mongoose.connection.transaction, booking: Booking.findOneAndUpdate,
    exists: JobOrder.exists, create: JobOrder.create, find: JobOrder.findOne,
    mechanic: User.findOneAndUpdate, bay: ServiceBay.findOneAndUpdate, services: Service.find };
  const bookingId = id(); const selected = input(); const jobId = id();
  const oilService = new mongoose.Types.ObjectId(); const brakeService = new mongoose.Types.ObjectId();
  let status = 'checked_in'; let mechanicAvailable = true; let bayAvailable = true; let created = 0;
  const reservedStartAt = new Date('2035-05-12T01:00:00.000Z'); const reservedEndAt = new Date('2035-05-12T04:00:00.000Z');
  mongoose.connection.transaction = async callback => callback({});
  Booking.findOneAndUpdate = async (filter, update, options) => {
    assert.equal(filter.status, 'checked_in'); assert.equal(options.returnDocument, 'after');
    if (status !== 'checked_in') return null;
    status = update.$set.status;
    assert.equal(String(update.$set.assignedMechanic), selected.mechanic);
    assert.equal(String(update.$set.assignedServiceBay), selected.serviceBay);
    return { concern: 'Inspect brakes', reservedStartAt, reservedEndAt, services: [oilService, brakeService] };
  };
  Service.find = () => ({ select: () => ({ session: () => ({ lean: async () => [
    { _id: oilService, name: 'Oil Service', checklistTemplate: ['Check oil level', 'Inspect filter'] },
    { _id: brakeService, name: 'Brake Service', checklistTemplate: ['Inspect brake pads'] },
  ] }) }) });
  JobOrder.exists = () => ({ session: async () => null });
  User.findOneAndUpdate = async (filter, update) => {
    assert.deepEqual({ role: filter.role, status: filter.status, isArchived: filter.isArchived, availability: filter.availability },
      { role: 'mechanic', status: 'active', isArchived: false, availability: 'available' });
    if (!mechanicAvailable) return null;
    mechanicAvailable = update.$set.availability !== 'busy';
    return {};
  };
  ServiceBay.findOneAndUpdate = async (filter, update) => {
    assert.equal(filter.operationalStatus, 'operational'); assert.equal(filter.isArchived, false);
    if (!bayAvailable) return null;
    bayAvailable = update.$set.availability !== 'occupied';
    return {};
  };
  JobOrder.create = async (records, options) => {
    created++; assert.ok(options.session);
    assert.equal(String(records[0].booking), bookingId);
    assert.equal(records[0].customerConcern, 'Inspect brakes');
    assert.equal(records[0].reservedStartAt, reservedStartAt);
    assert.equal(records[0].reservedEndAt, reservedEndAt);
    assert.deepEqual(records[0].serviceChecklist.map(item => [String(item.serviceId), item.serviceName, item.description, item.isCompleted]), [
      [String(oilService), 'Oil Service', 'Check oil level', false],
      [String(oilService), 'Oil Service', 'Inspect filter', false],
      [String(brakeService), 'Brake Service', 'Inspect brake pads', false],
    ]);
    return [{ _id: jobId }];
  };
  JobOrder.findOne = filter => ({ populate: () => ({ lean: async () => ({ _id: filter._id }) }) });
  try {
    const result = await jobs.assign(bookingId, selected);
    assert.equal(String(result._id), jobId);
    assert.equal(status, 'mechanic_assigned'); assert.equal(mechanicAvailable, false); assert.equal(bayAvailable, false);
    await assert.rejects(jobs.assign(bookingId, selected), { status: 409 });
    assert.equal(created, 1);
  } finally {
    mongoose.connection.transaction = originals.transaction; Booking.findOneAndUpdate = originals.booking;
    JobOrder.exists = originals.exists; JobOrder.create = originals.create; JobOrder.findOne = originals.find;
    User.findOneAndUpdate = originals.mechanic; ServiceBay.findOneAndUpdate = originals.bay;
    Service.find = originals.services;
  }
});

test('failed JobOrder creation aborts booking and resource changes', async () => {
  const originals = { transaction: mongoose.connection.transaction, booking: Booking.findOneAndUpdate,
    exists: JobOrder.exists, create: JobOrder.create, mechanic: User.findOneAndUpdate, bay: ServiceBay.findOneAndUpdate, services: Service.find };
  let bookingStatus = 'checked_in'; let mechanicAvailability = 'available'; let bayAvailability = 'available';
  mongoose.connection.transaction = async callback => {
    try { await callback({}); } catch (error) {
      bookingStatus = 'checked_in'; mechanicAvailability = 'available'; bayAvailability = 'available'; throw error;
    }
  };
  Booking.findOneAndUpdate = async () => { bookingStatus = 'mechanic_assigned'; return { concern: '' }; };
  Service.find = () => ({ select: () => ({ session: () => ({ lean: async () => [] }) }) });
  JobOrder.exists = () => ({ session: async () => null });
  User.findOneAndUpdate = async () => { mechanicAvailability = 'busy'; return {}; };
  ServiceBay.findOneAndUpdate = async () => { bayAvailability = 'occupied'; return {}; };
  JobOrder.create = async () => { throw new Error('Deliberate JobOrder insert failure'); };
  try {
    await assert.rejects(jobs.assign(id(), input()), /Deliberate JobOrder insert failure/);
    assert.equal(bookingStatus, 'checked_in'); assert.equal(mechanicAvailability, 'available'); assert.equal(bayAvailability, 'available');
  } finally {
    mongoose.connection.transaction = originals.transaction; Booking.findOneAndUpdate = originals.booking;
    JobOrder.exists = originals.exists; JobOrder.create = originals.create;
    User.findOneAndUpdate = originals.mechanic; ServiceBay.findOneAndUpdate = originals.bay;
    Service.find = originals.services;
  }
});

test('unfinished work or unavailable resources rejects assignment before JobOrder creation', async () => {
  const originals = { transaction: mongoose.connection.transaction, booking: Booking.findOneAndUpdate,
    exists: JobOrder.exists, create: JobOrder.create, mechanic: User.findOneAndUpdate, bay: ServiceBay.findOneAndUpdate };
  let existing = false; let mechanicAvailable = true; let bayAvailable = true; let created = 0;
  mongoose.connection.transaction = async callback => callback({});
  Booking.findOneAndUpdate = async () => ({ concern: '' });
  JobOrder.exists = () => ({ session: async () => existing ? { _id: id() } : null });
  User.findOneAndUpdate = async () => mechanicAvailable ? {} : null;
  ServiceBay.findOneAndUpdate = async () => bayAvailable ? {} : null;
  JobOrder.create = async () => { created++; return [{ _id: id() }]; };
  try {
    existing = true;
    await assert.rejects(jobs.assign(id(), input()), { status: 409 });
    existing = false; mechanicAvailable = false;
    await assert.rejects(jobs.assign(id(), input()), { status: 409 });
    mechanicAvailable = true; bayAvailable = false;
    await assert.rejects(jobs.assign(id(), input()), { status: 409 });
    assert.equal(created, 0);
  } finally {
    mongoose.connection.transaction = originals.transaction; Booking.findOneAndUpdate = originals.booking;
    JobOrder.exists = originals.exists; JobOrder.create = originals.create;
    User.findOneAndUpdate = originals.mechanic; ServiceBay.findOneAndUpdate = originals.bay;
  }
});

test('mechanic JobOrder list and detail queries are scoped to their own ID', async () => {
  const oldFind = JobOrder.find; const oldOne = JobOrder.findOne;
  let listFilter; let detailFilter;
  JobOrder.find = filter => { listFilter = filter; return { sort: () => ({ populate: () => ({ lean: async () => [] }) }) }; };
  JobOrder.findOne = filter => { detailFilter = filter; return { populate: () => ({ lean: async () => null }) }; };
  const mechanic = id();
  try {
    await jobs.list(mechanic);
    assert.equal(listFilter.mechanic, mechanic);
    await assert.rejects(jobs.get(id(), mechanic), { status: 404 });
    assert.equal(detailFilter.mechanic, mechanic);
    await jobs.list();
    assert.deepEqual(listFilter, {});
  } finally { JobOrder.find = oldFind; JobOrder.findOne = oldOne; }
});

test('duration override accepts only positive whole minutes within the supported limit', () => {
  assert.equal(jobs.durationInput({ estimatedDurationMinutes: 90 }), 90);
  for (const value of [0, -1, 1.5, 10081, '90']) {
    assert.throws(() => jobs.durationInput({ estimatedDurationMinutes: value }), { status: 400 });
  }
});

test('duration extension is rejected when the assigned Mechanic or Bay has a conflict', async () => {
  const originals = { transaction: mongoose.connection.transaction, jobFind: JobOrder.findOne,
    bookingFind: Booking.findOne, bookingUpdate: Booking.updateOne, jobUpdate: JobOrder.updateOne,
    canFit: resourceAvailability.canFitAssignedResources };
  const mechanic = id(); const serviceBay = id(); const bookingId = id(); const jobId = id();
  const start = new Date('2035-05-12T01:00:00Z'); const oldEnd = new Date('2035-05-12T02:00:00Z');
  let availabilityChecks = 0; let writes = 0;
  mongoose.connection.transaction = async callback => callback({});
  JobOrder.findOne = () => ({ session: () => ({ lean: async () => ({ _id: jobId, booking: bookingId,
    mechanic, serviceBay, status: 'in_progress', reservedStartAt: start, reservedEndAt: oldEnd, estimatedDurationMinutes: 60 }) }) });
  Booking.findOne = () => ({ session: () => ({ lean: async () => ({ _id: bookingId, status: 'in_service',
    assignedMechanic: mechanic, assignedServiceBay: serviceBay, reservedStartAt: start, reservedEndAt: oldEnd,
    estimatedDurationMinutes: 60 }) }) });
  resourceAvailability.canFitAssignedResources = async (period, options) => {
    availabilityChecks++; assert.equal(period.endAt.getTime(), start.getTime() + 120 * 60_000);
    assert.equal(String(options.excludeBookingId), String(bookingId)); return { available: false };
  };
  Booking.updateOne = async () => { writes++; };
  JobOrder.updateOne = async () => { writes++; };
  try {
    await assert.rejects(jobs.updateEstimatedDuration(String(jobId), { _id: mechanic, role: 'mechanic' },
      { estimatedDurationMinutes: 120 }), { status: 409 });
    assert.equal(availabilityChecks, 1); assert.equal(writes, 0);
  } finally {
    mongoose.connection.transaction = originals.transaction; JobOrder.findOne = originals.jobFind;
    Booking.findOne = originals.bookingFind; Booking.updateOne = originals.bookingUpdate;
    JobOrder.updateOne = originals.jobUpdate; resourceAvailability.canFitAssignedResources = originals.canFit;
  }
});

test('completing a JobOrder releases both reservations at actual completion time', async () => {
  const originals = { transaction: mongoose.connection.transaction, jobFind: JobOrder.findOne,
    jobUpdate: JobOrder.findOneAndUpdate, bookingUpdate: Booking.findOneAndUpdate,
    userUpdate: User.updateOne, bayUpdate: ServiceBay.updateOne,
    reminders: engagement.updateReminders };
  const mechanic = id(); const serviceBay = id(); const booking = id(); const jobId = id();
  const startedAt = new Date(Date.now() - 45 * 60_000);
  let bookingChange; let jobChange;
  mongoose.connection.transaction = async callback => callback({});
  JobOrder.findOne = filter => filter.status ? {
    session: () => ({ lean: async () => ({ _id: jobId, booking, mechanic, serviceBay, status: 'in_progress', startedAt }) }),
  } : { populate: () => ({ lean: async () => ({ _id: jobId }) }) };
  Booking.findOneAndUpdate = async (_filter, update) => { bookingChange = update; return { _id: booking, status: 'completed' }; };
  JobOrder.findOneAndUpdate = async (_filter, update) => { jobChange = update; return {}; };
  User.updateOne = async () => ({}); ServiceBay.updateOne = async () => ({});
  engagement.updateReminders = async () => {};
  try {
    await jobs.transition(String(jobId), { role: 'staff', _id: id() }, 'complete');
    assert.equal(bookingChange.$set.reservedEndAt.getTime(), jobChange.$set.reservedEndAt.getTime());
    assert.equal(bookingChange.$set.actualDurationMinutes, jobChange.$set.actualDurationMinutes);
    assert.ok(bookingChange.$set.reservedEndAt >= startedAt);
    assert.ok(bookingChange.$set.actualDurationMinutes >= 45);
  } finally {
    mongoose.connection.transaction = originals.transaction; JobOrder.findOne = originals.jobFind;
    JobOrder.findOneAndUpdate = originals.jobUpdate; Booking.findOneAndUpdate = originals.bookingUpdate;
    User.updateOne = originals.userUpdate; ServiceBay.updateOne = originals.bayUpdate;
    engagement.updateReminders = originals.reminders;
  }
});
