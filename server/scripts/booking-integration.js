// Explicit opt-in integration check. Uses a generated disposable Atlas database only.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const mongoose = require('mongoose');
const connectDatabase = require('../config/db');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const Service = require('../models/Service');
const Schedule = require('../models/Schedule');
const Booking = require('../models/Booking');
const Notification = require('../models/Notification');
const bookings = require('../services/bookingService');

const databaseName = `tac_${randomUUID().replaceAll('-', '')}`;
const password = '$2b$12$' + 'a'.repeat(53); // Model fixture, never a login credential.
let stage = 'connect';
async function run() {
  assert.ok(process.env.MONGO_URI, 'MONGO_URI is required.');
  try {
    await connectDatabase({ dbName: databaseName });
    assert.equal(mongoose.connection.name, databaseName);
    stage = 'create temporary fixtures';
    await Promise.all([User, Vehicle, Service, Schedule, Booking, Notification].map(Model => Model.init()));
    const client = await User.create({ fullName: 'Temporary Booking Client', email: 'booking-client@example.invalid', password, role: 'client', emailVerified: true });
    const other = await User.create({ fullName: 'Other Booking Client', email: 'other-booking@example.invalid', password, role: 'client', emailVerified: true });
    const vehicle = await Vehicle.create({ owner: client._id, make: 'Toyota', model: 'Vios', year: 2024, plateNumber: 'BOOK1234', transmission: 'automatic' });
    const otherVehicle = await Vehicle.create({ owner: other._id, make: 'Toyota', model: 'Wigo', year: 2024, plateNumber: 'OTHER123', transmission: 'manual' });
    const service1 = await Service.create({ name: 'Temporary inspection', estimatedDuration: 30, estimatedPrice: 500 });
    const service2 = await Service.create({ name: 'Temporary oil change', estimatedDuration: 45, estimatedPrice: 700 });
    const inactive = await Service.create({ name: 'Temporary inactive', estimatedDuration: 30, estimatedPrice: 400, isActive: false });
    const archived = await Service.create({ name: 'Temporary archived', estimatedDuration: 30, estimatedPrice: 400, isArchived: true, archivedAt: new Date() });
    const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const slot = await Schedule.create({ date, timeSlot: '09:00', maximumCapacity: 1 });
    const body = { vehicle: String(vehicle._id), services: [String(service1._id), String(service2._id)], schedule: String(slot._id) };
    stage = 'validate ownership and service eligibility';
    await assert.rejects(bookings.create(client._id, { ...body, vehicle: String(otherVehicle._id) }), error => error.status === 400);
    vehicle.isArchived = true; vehicle.archivedAt = new Date(); await vehicle.save();
    await assert.rejects(bookings.create(client._id, body), error => error.status === 400);
    vehicle.isArchived = false; vehicle.archivedAt = null; await vehicle.save();
    await assert.rejects(bookings.create(client._id, { ...body, services: [String(inactive._id)] }), error => error.status === 400);
    await assert.rejects(bookings.create(client._id, { ...body, services: [String(archived._id)] }), error => error.status === 400);
    await assert.rejects(bookings.create(client._id, { ...body, services: [String(service1._id), String(service1._id)] }), error => error.status === 400);
    stage = 'verify transaction rollback';
    const originalCreate = Booking.create;
    try {
      Booking.create = async () => { throw new Error('Deliberate booking insert failure'); };
      await assert.rejects(bookings.create(client._id, body), /Deliberate booking insert failure/);
    } finally { Booking.create = originalCreate; }
    assert.equal((await Schedule.findById(slot._id)).currentBookingCount, 0);
    assert.equal(await Booking.countDocuments(), 0);
    stage = 'verify concurrent booking admission';
    const attempts = await Promise.allSettled(Array.from({ length: 4 }, () => bookings.create(client._id, body)));
    const successes = attempts.filter(result => result.status === 'fulfilled');
    assert.equal(successes.length, 1);
    for (const result of attempts.filter(result => result.status === 'rejected')) assert.equal(result.reason.status, 409);
    assert.equal((await Schedule.findById(slot._id)).currentBookingCount, 1);
    assert.equal(await Booking.countDocuments(), 1);
    assert.equal(successes[0].value.services.length, 2);
    stage = 'verify cancellation, replay and Admin transitions';
    const firstId = String(successes[0].value._id);
    await bookings.transition(firstId, client, 'cancel');
    assert.equal((await Schedule.findById(slot._id)).currentBookingCount, 0);
    await assert.rejects(bookings.transition(firstId, client, 'cancel'), error => error.status === 409);
    assert.equal((await Schedule.findById(slot._id)).currentBookingCount, 0);
    const second = await bookings.create(client._id, body);
    await bookings.transition(String(second._id), { role: 'admin' }, 'confirm');
    await assert.rejects(bookings.transition(String(second._id), { role: 'admin' }, 'reject'), error => error.status === 409);
    await bookings.transition(String(second._id), { role: 'admin' }, 'cancel');
    assert.equal((await Schedule.findById(slot._id)).currentBookingCount, 0);
    const third = await bookings.create(client._id, body);
    await bookings.transition(String(third._id), { role: 'admin' }, 'reject');
    assert.equal((await Schedule.findById(slot._id)).currentBookingCount, 0);
    assert.equal(await Booking.countDocuments(), 3); // Historical records remain.
    stage = 'verify mixed Online and Walk-In admission';
    const mixedSlot = await Schedule.create({ date, timeSlot: '10:00', maximumCapacity: 1 });
    const mixedBody = { ...body, schedule: String(mixedSlot._id) };
    const mixed = await Promise.allSettled([
      bookings.create(client._id, mixedBody),
      bookings.createWalkIn({ client: String(client._id), ...mixedBody }),
    ]);
    const mixedWinners = mixed.filter(result => result.status === 'fulfilled');
    assert.equal(mixedWinners.length, 1);
    for (const result of mixed.filter(result => result.status === 'rejected')) assert.equal(result.reason.status, 409);
    assert.equal((await Schedule.findById(mixedSlot._id)).currentBookingCount, 1);
    assert.equal(await Booking.countDocuments({ schedule: mixedSlot._id }), 1);
    const mixedWinner = mixedWinners[0].value;
    if (mixedWinner.status === 'pending') await bookings.transition(String(mixedWinner._id), { role: 'admin' }, 'confirm');
    await bookings.transition(String(mixedWinner._id), { role: 'admin' }, 'check-in');
    assert.equal((await Schedule.findById(mixedSlot._id)).currentBookingCount, 1);
    await assert.rejects(bookings.transition(String(mixedWinner._id), { role: 'admin' }, 'check-in'), error => error.status === 409);
    stage = 'verify Walk-In rollback and confirmed creation';
    const walkInSlot = await Schedule.create({ date, timeSlot: '11:00', maximumCapacity: 1 });
    const walkInBody = { client: String(client._id), ...body, schedule: String(walkInSlot._id) };
    const originalCreateWalkIn = Booking.create;
    try {
      Booking.create = async () => { throw new Error('Deliberate Walk-In insert failure'); };
      await assert.rejects(bookings.createWalkIn(walkInBody), /Deliberate Walk-In insert failure/);
    } finally { Booking.create = originalCreateWalkIn; }
    assert.equal((await Schedule.findById(walkInSlot._id)).currentBookingCount, 0);
    assert.equal(await Booking.countDocuments({ schedule: walkInSlot._id }), 0);
    const walkIn = await bookings.createWalkIn(walkInBody);
    assert.equal(walkIn.bookingType, 'walk-in');
    assert.equal(walkIn.status, 'confirmed');
    await bookings.transition(String(walkIn._id), { role: 'admin' }, 'check-in');
    assert.equal((await Schedule.findById(walkInSlot._id)).currentBookingCount, 1);
    assert.equal((await Booking.findById(walkIn._id)).status, 'checked_in');
    console.log('PASS: mixed Online/Walk-In race admits one; Walk-In rollback and Check-In preserve capacity.');
    vehicle.isArchived = true; vehicle.archivedAt = new Date(); await vehicle.save();
    service1.isArchived = true; service1.archivedAt = new Date(); await service1.save();
    const historical = await bookings.get(firstId, client._id);
    assert.equal(historical.vehicle.isArchived, true);
    assert.equal(historical.services.some(item => item.isArchived), true);
    console.log('PASS: isolated booking eligibility, concurrency, rollback, transitions and replay checks.');
  } finally {
    try {
      if (mongoose.connection.readyState === 1) {
        assert.match(databaseName, /^tac_[a-f0-9]{32}$/);
        assert.equal(mongoose.connection.name, databaseName);
        // This Atlas account allows collection cleanup but not dropDatabase.
        const collections = await mongoose.connection.db.listCollections().toArray();
        const expected = [User, Vehicle, Service, Schedule, Booking, Notification].map(Model => Model.collection.name);
        for (const collection of collections) assert.ok(expected.includes(collection.name));
        for (const collection of collections) await mongoose.connection.db.dropCollection(collection.name);
        assert.equal((await mongoose.connection.db.listCollections().toArray()).length, 0);
        console.log('PASS: disposable booking collections and records removed.');
      }
    } finally { await mongoose.disconnect(); }
  }
}
run().catch(() => { console.error(`Booking integration failed during ${stage}.`); process.exitCode = 1; });
