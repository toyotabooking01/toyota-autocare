const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const Service = require('../models/Service');
const Schedule = require('../models/Schedule');
const Booking = require('../models/Booking');
const bookings = require('../services/bookingService');
const engagement = require('../services/engagementService');
const originalRecordEvent = engagement.recordBookingEvent;
before(() => { engagement.recordBookingEvent = async () => {}; });
after(() => { engagement.recordBookingEvent = originalRecordEvent; });

const id = () => String(new mongoose.Types.ObjectId());
const request = () => ({ client: id(), vehicle: id(), services: [id(), id()], schedule: id() });

test('Admin lookup returns only selected Client fields and current owned vehicles', async () => {
  const oldFind = User.find;
  const oldExists = User.exists;
  const oldVehicleFind = Vehicle.find;
  const clientId = id();
  let clientFilter; let vehicleFilter;
  User.find = filter => { clientFilter = filter; return { select: () => ({ sort: () => ({ limit: () => ({ lean: async () => [
    { _id: clientId, fullName: 'Sample Client', email: 'sample@example.invalid', password: 'hidden-hash', authVersion: 5, otpSequence: 10 },
  ] }) }) }) }; };
  User.exists = async () => ({ _id: clientId });
  Vehicle.find = filter => { vehicleFilter = filter; return { select: () => ({ sort: () => ({ lean: async () => [
    { _id: id(), make: 'Toyota', model: 'Vios', year: 2024, plateNumber: 'ABC1234', owner: clientId, isArchived: false },
  ] }) }) }; };
  try {
    const clients = await bookings.walkInClients('Sample');
    assert.equal(clientFilter.role, 'client');
    assert.equal(clientFilter.status, 'active');
    assert.equal(clientFilter.isArchived, false);
    assert.deepEqual(Object.keys(clients[0]).sort(), ['_id', 'email', 'fullName']);
    const vehicles = await bookings.walkInVehicles(clientId);
    assert.equal(vehicleFilter.owner, clientId);
    assert.equal(vehicleFilter.isArchived, false);
    assert.equal(vehicles[0].owner, undefined);
  } finally { User.find = oldFind; User.exists = oldExists; Vehicle.find = oldVehicleFind; }
});

test('walk-in requires an eligible Client and rejects arbitrary status or source', async () => {
  const oldTransaction = mongoose.connection.transaction;
  const oldUser = User.exists;
  mongoose.connection.transaction = async callback => callback({});
  User.exists = () => ({ session: async () => null });
  try {
    const body = request();
    await assert.rejects(bookings.createWalkIn(body), { status: 400 });
    await assert.rejects(bookings.createWalkIn({ ...body, status: 'checked_in' }), { status: 400 });
    await assert.rejects(bookings.createWalkIn({ ...body, bookingType: 'online' }), { status: 400 });
  } finally { mongoose.connection.transaction = oldTransaction; User.exists = oldUser; }
});

test('online and walk-in calls use the same atomic reservation, with distinct fixed source/status', async () => {
  const oldTransaction = mongoose.connection.transaction;
  const oldUser = User.exists;
  const oldVehicle = Vehicle.exists;
  const oldService = Service.countDocuments;
  const oldSlot = Schedule.findById;
  const oldReserve = Schedule.findOneAndUpdate;
  const oldCreate = Booking.create;
  const oldFind = Booking.findOne;
  const body = request();
  const reservations = []; const created = [];
  mongoose.connection.transaction = async callback => callback({});
  User.exists = () => ({ session: async () => ({ _id: body.client }) });
  Vehicle.exists = filter => ({ session: async () => {
    assert.equal(String(filter.owner), body.client);
    assert.equal(filter.isArchived, false);
    return { _id: body.vehicle };
  } });
  Service.countDocuments = filter => ({ session: async () => {
    assert.equal(filter.isActive, true); assert.equal(filter.isArchived, false);
    return body.services.length;
  } });
  Schedule.findById = () => ({ session: () => ({ lean: async () => ({ date: '2035-05-12', timeSlot: '09:00', isEnabled: true }) }) });
  Schedule.findOneAndUpdate = async filter => {
    reservations.push(filter);
    return { date: '2035-05-12', timeSlot: '09:00' };
  };
  Booking.create = async records => { created.push(records[0]); return [{ _id: id() }]; };
  Booking.findOne = () => ({ populate: () => ({ lean: async () => ({ _id: id() }) }) });
  try {
    await bookings.create(body.client, { vehicle: body.vehicle, services: body.services, schedule: body.schedule });
    await bookings.createWalkIn(body);
    assert.deepEqual(reservations[0], reservations[1]);
    assert.deepEqual(reservations[0].$expr.$lt, ['$currentBookingCount', '$maximumCapacity']);
    assert.equal(created[0].bookingType, 'online'); assert.equal(created[0].status, 'pending');
    assert.equal(created[1].bookingType, 'walk-in'); assert.equal(created[1].status, 'confirmed');
  } finally {
    mongoose.connection.transaction = oldTransaction; User.exists = oldUser; Vehicle.exists = oldVehicle;
    Service.countDocuments = oldService; Schedule.findById = oldSlot;
    Schedule.findOneAndUpdate = oldReserve; Booking.create = oldCreate; Booking.findOne = oldFind;
  }
});

test('walk-in rejects another Client vehicle, unavailable Services, and full Schedule', async () => {
  const oldTransaction = mongoose.connection.transaction;
  const oldUser = User.exists;
  const oldVehicle = Vehicle.exists;
  const oldService = Service.countDocuments;
  const oldSlot = Schedule.findById;
  const oldReserve = Schedule.findOneAndUpdate;
  const body = request();
  let ownerMatches = false; let activeServices = 2; let capacity = true;
  mongoose.connection.transaction = async callback => callback({});
  User.exists = () => ({ session: async () => ({ _id: body.client }) });
  Vehicle.exists = () => ({ session: async () => ownerMatches ? { _id: body.vehicle } : null });
  Service.countDocuments = () => ({ session: async () => activeServices });
  Schedule.findById = () => ({ session: () => ({ lean: async () => ({ date: '2035-05-12', timeSlot: '09:00', isEnabled: true }) }) });
  Schedule.findOneAndUpdate = async () => capacity ? { date: '2035-05-12', timeSlot: '09:00' } : null;
  try {
    await assert.rejects(bookings.createWalkIn(body), { status: 400 });
    ownerMatches = true; activeServices = 1;
    await assert.rejects(bookings.createWalkIn(body), { status: 400 });
    activeServices = 2; capacity = false;
    await assert.rejects(bookings.createWalkIn(body), { status: 409 });
  } finally {
    mongoose.connection.transaction = oldTransaction; User.exists = oldUser; Vehicle.exists = oldVehicle;
    Service.countDocuments = oldService; Schedule.findById = oldSlot; Schedule.findOneAndUpdate = oldReserve;
  }
});

test('check-in changes only confirmed to checked_in and never adjusts capacity', async () => {
  const oldTransaction = mongoose.connection.transaction;
  const oldUpdate = Booking.findOneAndUpdate;
  const oldFind = Booking.findOne;
  const oldCapacity = Schedule.updateOne;
  let status = 'confirmed'; let capacityWrites = 0;
  mongoose.connection.transaction = async callback => callback({});
  Booking.findOneAndUpdate = async filter => {
    if (status !== 'confirmed' || filter.status !== 'confirmed') return null;
    status = 'checked_in'; return { status };
  };
  Booking.findOne = () => ({ populate: () => ({ lean: async () => ({ status }) }) });
  Schedule.updateOne = async () => { capacityWrites++; };
  try {
    await bookings.transition(id(), { role: 'admin' }, 'check-in');
    assert.equal(status, 'checked_in'); assert.equal(capacityWrites, 0);
    await assert.rejects(bookings.transition(id(), { role: 'admin' }, 'check-in'), { status: 409 });
    for (const invalid of ['pending', 'cancelled', 'rejected', 'completed']) {
      status = invalid;
      await assert.rejects(bookings.transition(id(), { role: 'admin' }, 'check-in'), { status: 409 });
    }
    await assert.rejects(bookings.transition(id(), { role: 'client' }, 'check-in'), { status: 403 });
    assert.equal(capacityWrites, 0);
  } finally { mongoose.connection.transaction = oldTransaction; Booking.findOneAndUpdate = oldUpdate; Booking.findOne = oldFind; Schedule.updateOne = oldCapacity; }
});
