const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const JobOrder = require('../models/JobOrder');
const User = require('../models/User');
const ServiceBay = require('../models/ServiceBay');
const jobs = require('../services/jobOrderService');
const engagement = require('../services/engagementService');
const originalRecordEvent = engagement.recordBookingEvent;
before(() => { engagement.recordBookingEvent = async () => {}; });
after(() => { engagement.recordBookingEvent = originalRecordEvent; });

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
    assert.deepEqual(Object.keys(result.mechanics[0]).sort(), ['_id', 'employeeId', 'fullName']);
    assert.deepEqual(Object.keys(result.serviceBays[0]).sort(), ['_id', 'name']);
  } finally { User.find = oldUsers; ServiceBay.find = oldBays; }
});

test('assignment claims checked-in booking, reserves eligible resources and creates one JobOrder', async () => {
  const originals = { transaction: mongoose.connection.transaction, booking: Booking.findOneAndUpdate,
    exists: JobOrder.exists, create: JobOrder.create, find: JobOrder.findOne,
    mechanic: User.findOneAndUpdate, bay: ServiceBay.findOneAndUpdate };
  const bookingId = id(); const selected = input(); const jobId = id();
  let status = 'checked_in'; let mechanicAvailable = true; let bayAvailable = true; let created = 0;
  mongoose.connection.transaction = async callback => callback({});
  Booking.findOneAndUpdate = async (filter, update, options) => {
    assert.equal(filter.status, 'checked_in'); assert.equal(options.returnDocument, 'after');
    if (status !== 'checked_in') return null;
    status = update.$set.status;
    assert.equal(String(update.$set.assignedMechanic), selected.mechanic);
    assert.equal(String(update.$set.assignedServiceBay), selected.serviceBay);
    return { concern: 'Inspect brakes' };
  };
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
  }
});

test('failed JobOrder creation aborts booking and resource changes', async () => {
  const originals = { transaction: mongoose.connection.transaction, booking: Booking.findOneAndUpdate,
    exists: JobOrder.exists, create: JobOrder.create, mechanic: User.findOneAndUpdate, bay: ServiceBay.findOneAndUpdate };
  let bookingStatus = 'checked_in'; let mechanicAvailability = 'available'; let bayAvailability = 'available';
  mongoose.connection.transaction = async callback => {
    try { await callback({}); } catch (error) {
      bookingStatus = 'checked_in'; mechanicAvailability = 'available'; bayAvailability = 'available'; throw error;
    }
  };
  Booking.findOneAndUpdate = async () => { bookingStatus = 'mechanic_assigned'; return { concern: '' }; };
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
