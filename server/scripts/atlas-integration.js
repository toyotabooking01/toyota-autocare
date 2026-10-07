// Explicit opt-in only: npm run test:integration. Never run against application data.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const mongoose = require('mongoose');
const connectDatabase = require('../config/db');
const models = require('../models');
const { User, Vehicle, Service, Booking, Schedule, ServiceBay, JobOrder,
  Notification, MaintenanceReminder, EmailOtp } = models;

// Generated internally, never supplied by an environment variable or CLI argument.
// 36 bytes: compatible with Atlas tiers that limit database names to 38 bytes.
const databaseName = `tac_${randomUUID().replaceAll('-', '')}`;
const password = '$2b$12$' + 'a'.repeat(53); // Validation fixture, not a usable login.
let stage = 'connect to isolated database';

function passed(message) {
  console.log(`PASS: ${message}`);
}

async function duplicate(operation, field) {
  await assert.rejects(operation, error => error.code === 11000 && error.keyPattern?.[field] === 1);
}

async function run() {
  assert.ok(process.env.MONGO_URI, 'MONGO_URI is required for integration checks.');
  try {
    await connectDatabase({ dbName: databaseName });
    assert.equal(mongoose.connection.name, databaseName);
    console.log(`Temporary database: ${databaseName}`);

    stage = 'create and inspect indexes';
    const initialized = await Promise.allSettled(Object.values(models).map(Model => Model.init()));
    for (const result of initialized) assert.equal(result.status, 'fulfilled');
    for (const [Model, field] of [[User, 'email'], [User, 'employeeId'],
      [Vehicle, 'plateNumber'], [JobOrder, 'booking']]) {
      const index = (await Model.collection.indexes()).find(item => item.key[field] === 1 && item.unique);
      assert.ok(index, `${Model.modelName}.${field} unique index missing`);
      if (field === 'employeeId') {
        assert.deepEqual(index.partialFilterExpression, { employeeId: { $type: 'string' } });
      }
    }
    passed('Atlas created the expected unique and partial indexes');

    stage = 'create model fixtures';
    const client = await User.create({ fullName: 'Temporary Client', email: ' CLIENT@example.invalid ', password });
    // Two clients with no employeeId must coexist under the partial index.
    await User.create({ fullName: 'Temporary Client Two', email: 'client2@example.invalid', password });
    const mechanic = await User.create({ fullName: 'Temporary Mechanic', email: 'mechanic@example.invalid',
      password, role: 'mechanic', employeeId: ' mech-001 ', availability: 'available' });
    const vehicle = await Vehicle.create({ owner: client._id, make: 'Toyota', model: 'Vios',
      year: 2024, plateNumber: ' tst-1234 ', transmission: 'automatic' });
    const firstService = await Service.create({ name: 'Temporary service', estimatedDuration: 30, estimatedPrice: 500 });
    const secondService = await Service.create({ name: 'Temporary service', estimatedDuration: 60, estimatedPrice: 1000 });
    const schedule = await Schedule.create({ date: '2030-01-10', timeSlot: '09:00', maximumCapacity: 3,
      currentBookingCount: 1 });
    const bay = await ServiceBay.create({ name: 'Temporary Bay' });
    const bookingData = { client: client._id, vehicle: vehicle._id,
      services: [firstService._id, secondService._id], schedule: schedule._id,
      bookingDate: schedule.date, bookingTime: schedule.timeSlot, bookingType: 'online',
      assignedMechanic: mechanic._id, assignedServiceBay: bay._id, status: 'mechanic_assigned' };
    const booking = await Booking.create(bookingData);
    const jobData = { booking: booking._id, mechanic: mechanic._id, serviceBay: bay._id,
      serviceChecklist: [{ description: 'Task for first service' }, { description: 'Task for second service' }] };
    const job = await JobOrder.create(jobData);
    const notification = await Notification.create({ user: client._id, title: 'Temporary notice',
      message: 'Temporary integration fixture', type: 'booking' });
    const reminder = await MaintenanceReminder.create({ client: client._id, vehicle: vehicle._id,
      service: firstService._id, lastServiceDate: '2030-01-10', nextRecommendedServiceDate: '2030-04-10' });
    const otp = await EmailOtp.create({ email: client.email, otpHash: 'a'.repeat(64),
      purpose: 'email_verification', expiresAt: new Date(Date.now() + 3600000) });
    for (const Model of Object.values(models)) assert.ok(await Model.countDocuments() > 0);
    assert.equal((await User.findById(client._id)).password, undefined);
    assert.equal((await EmailOtp.findById(otp._id)).otpHash, undefined);
    passed('all ten models persisted; optional employee IDs and repeated service names are allowed');

    stage = 'validate writes and unique conflicts';
    await assert.rejects(Booking.create({ ...bookingData, services: [] }), { name: 'ValidationError' });
    await assert.rejects(Booking.create({ ...bookingData, services: [firstService._id, firstService._id] }),
      { name: 'ValidationError' });
    await assert.rejects(Vehicle.create({ owner: client._id, make: 'Toyota', model: 'Vios',
      year: 2024, plateNumber: 'TST9999', transmission: 'automatic', currentMileage: -1 }),
    { name: 'ValidationError' });
    await duplicate(User.create({ fullName: 'Duplicate', email: ' CLIENT@EXAMPLE.INVALID ', password }), 'email');
    await duplicate(User.create({ fullName: 'Duplicate mechanic', email: 'duplicate@example.invalid',
      password, role: 'mechanic', employeeId: 'MECH-001' }), 'employeeId');
    await duplicate(Vehicle.create({ owner: client._id, make: 'Toyota', model: 'Vios', year: 2024,
      plateNumber: 'TST 1234', transmission: 'manual' }), 'plateNumber');
    await duplicate(JobOrder.create(jobData), 'booking');
    assert.equal(await JobOrder.countDocuments({ booking: booking._id }), 1);
    assert.equal(await Booking.countDocuments(), 1);
    passed('validation rejects invalid writes; normalized unique fields and one Job Order per Booking enforced');

    stage = 'populate references';
    const populated = await Booking.findById(booking._id)
      .populate('client vehicle services schedule assignedMechanic assignedServiceBay');
    assert.equal(populated.client.role, 'client');
    assert.ok(populated.vehicle.owner.equals(populated.client._id));
    assert.equal(populated.services.length, 2);
    assert.ok(populated.services.every(service => service.isActive && !service.isArchived));
    assert.equal(populated.schedule.date, populated.bookingDate);
    assert.equal(populated.assignedMechanic.role, 'mechanic');
    assert.equal(populated.assignedMechanic.status, 'active');
    assert.equal(populated.assignedServiceBay.operationalStatus, 'operational');
    const populatedJob = await JobOrder.findById(job._id).populate('booking mechanic serviceBay');
    assert.ok(populatedJob.booking._id.equals(booking._id));
    assert.ok(populatedJob.mechanic._id.equals(mechanic._id));
    assert.ok(populatedJob.serviceBay._id.equals(bay._id));
    assert.equal(populatedJob.serviceChecklist.length, 2);
    assert.ok((await Vehicle.findById(vehicle._id).populate('owner')).owner._id.equals(client._id));
    assert.ok((await Notification.findById(notification._id).populate('user')).user._id.equals(client._id));
    const populatedReminder = await MaintenanceReminder.findById(reminder._id).populate('client vehicle service');
    assert.ok(populatedReminder.client._id.equals(client._id));
    assert.ok(populatedReminder.vehicle._id.equals(vehicle._id));
    assert.ok(populatedReminder.service._id.equals(firstService._id));
    passed('references populate consistently, including both services and the visit-wide Job Order');

    stage = 'atomic capacity and rollback';
    const raceSlot = await Schedule.create({ date: '2030-01-11', timeSlot: '09:00', maximumCapacity: 3 });
    const reserve = session => Schedule.findOneAndUpdate({
      _id: raceSlot._id, isEnabled: true,
      $expr: { $lt: ['$currentBookingCount', '$maximumCapacity'] },
    }, { $inc: { currentBookingCount: 1 } }, { returnDocument: 'after', session });
    const session = await mongoose.startSession();
    const rollbackId = new mongoose.Types.ObjectId();
    try {
      await assert.rejects(session.withTransaction(async () => {
        assert.ok(await reserve(session));
        await Booking.create([{ ...bookingData, _id: rollbackId,
          schedule: raceSlot._id, bookingDate: raceSlot.date }], { session });
        throw new Error('Deliberate integration rollback');
      }), /Deliberate integration rollback/);
    } finally {
      await session.endSession();
    }
    assert.equal(await Booking.countDocuments({ _id: rollbackId }), 0);
    assert.equal((await Schedule.findById(raceSlot._id)).currentBookingCount, 0);
    const reservations = await Promise.allSettled(Array.from({ length: 8 }, () => reserve()));
    for (const result of reservations) assert.equal(result.status, 'fulfilled');
    assert.equal(reservations.filter(result => result.value !== null).length, 3);
    assert.equal((await Schedule.findById(raceSlot._id)).currentBookingCount, 3);
    passed('8 concurrent reservations admit exactly 3; transaction rollback retains neither booking nor count');

    stage = 'archive and restore historical references';
    booking.status = 'completed';
    await booking.save();
    job.status = 'completed';
    job.startedAt = new Date('2030-01-10T01:00:00Z');
    job.completedAt = new Date('2030-01-10T02:30:00Z');
    await job.save();
    const masterRecords = [client, mechanic, vehicle, firstService, secondService, bay];
    for (const record of masterRecords) {
      record.isArchived = true;
      record.archivedAt = new Date();
      await record.save();
    }
    await duplicate(User.create({ fullName: 'Duplicate archived', email: client.email, password }), 'email');
    await duplicate(User.create({ fullName: 'Duplicate archived mechanic', email: 'archived@example.invalid',
      password, role: 'mechanic', employeeId: mechanic.employeeId }), 'employeeId');
    await duplicate(Vehicle.create({ owner: client._id, make: 'Toyota', model: 'Vios', year: 2024,
      plateNumber: vehicle.plateNumber, transmission: 'manual' }), 'plateNumber');
    const historical = await Booking.findById(booking._id)
      .populate('client vehicle services assignedMechanic assignedServiceBay');
    assert.ok(historical.client.isArchived && historical.vehicle.isArchived);
    assert.ok(historical.services.every(service => service.isArchived));
    assert.ok(historical.assignedMechanic.isArchived && historical.assignedServiceBay.isArchived);
    assert.equal(await JobOrder.countDocuments({ booking: booking._id }), 1);
    assert.ok(await MaintenanceReminder.exists({ _id: reminder._id }));
    for (const record of masterRecords) {
      record.isArchived = false;
      record.archivedAt = null;
      await record.save();
      const restored = await record.constructor.findById(record._id);
      assert.equal(restored.isArchived, false);
      assert.equal(restored.archivedAt, null);
    }
    passed('archive/restore preserves history and reserves unique identifiers');
  } finally {
    try {
      if (mongoose.connection.readyState === 1) {
        // Test-only cleanup: refuse any database except this run's generated name.
        assert.match(databaseName, /^tac_[a-f0-9]{32}$/);
        assert.equal(mongoose.connection.name, databaseName);
        // This Atlas account allows collection cleanup but not dropDatabase.
        const collections = await mongoose.connection.db.listCollections().toArray();
        const expectedNames = Object.values(models).map(Model => Model.collection.name);
        for (const collection of collections) assert.ok(expectedNames.includes(collection.name));
        for (const collection of collections) {
          await mongoose.connection.db.dropCollection(collection.name);
        }
        assert.equal((await mongoose.connection.db.listCollections().toArray()).length, 0);
        passed(`cleanup verified: ${databaseName} has no remaining collections or records`);
      }
    } catch (error) {
      console.error(`Cleanup failed for temporary database ${databaseName}; manual review required.`);
      throw error;
    } finally {
      await mongoose.disconnect();
    }
  }
}

run().catch(error => {
  // Avoid dumping driver messages, connection strings or credentials.
  console.error(`Integration failed during ${stage}: ${error.name} (${error.code || 'no code'}).`);
  process.exitCode = 1;
});
