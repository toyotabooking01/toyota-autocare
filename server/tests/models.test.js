const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const models = require('../models');

const id = () => new mongoose.Types.ObjectId();
const fixtures = {
  User: { fullName: 'Test User', email: ' USER@Example.com ', password: '$2b$12$' + 'a'.repeat(53) },
  Vehicle: { owner: id(), make: 'Toyota', model: 'Vios', year: 2024, plateNumber: ' abc1234 ', transmission: 'automatic' },
  ToyotaCatalog: { make: 'Toyota', market: 'Philippines', model: 'Vios', year: 2025, variant: '1.3 XLE CVT', category: 'Sedan', fuelType: 'gasoline', transmission: 'cvt', seatingCapacity: 5 },
  Service: { name: 'Inspection', estimatedDuration: 60, estimatedPrice: 1000 },
  Booking: { client: id(), vehicle: id(), services: [id()], schedule: id(), bookingDate: '2026-10-10', bookingTime: '09:00', bookingType: 'online' },
  Schedule: { date: '2026-10-10', timeSlot: '09:00', maximumCapacity: 2 },
  ServiceBay: { name: 'Bay 1' },
  JobOrder: { booking: id(), mechanic: id(), serviceBay: id() },
  Payment: { booking: id(), client: id(), stage: 'final', amountCents: 10000, method: 'gcash', submittedBy: id() },
  Notification: { user: id(), title: 'Update', message: 'Booking updated', type: 'booking' },
  MaintenanceReminder: { client: id(), vehicle: id(), service: id(), lastServiceDate: '2026-10-10', nextRecommendedServiceDate: '2026-11-10' },
  EmailOtp: { email: ' USER@Example.com ', otpHash: 'a'.repeat(64), purpose: 'email_verification', expiresAt: new Date(Date.now() + 600000) },
  Counter: { _id: 'testCounter', sequence: 1 },
};

for (const [name, Model] of Object.entries(models)) {
  test(`${name}: valid document and registered references`, async () => {
    await new Model(fixtures[name]).validate();
    Model.schema.eachPath((path, schemaType) => {
      if (schemaType.options.ref) assert.ok(models[schemaType.options.ref], `${name}.${path} ref missing`);
      const element = schemaType.getEmbeddedSchemaType();
      if (element?.options.ref) assert.ok(models[element.options.ref], `${name}.${path} array ref missing`);
    });
    if (name !== 'Counter') {
      assert.ok(Model.schema.path('createdAt'));
      assert.ok(Model.schema.path('updatedAt'));
    }
  });
}

async function invalid(name, changes, field) {
  await assert.rejects(new models[name]({ ...fixtures[name], ...changes }).validate(),
    error => Boolean(error.errors?.[field]));
}

test('User roles, mechanic employee ID, normalized email and secret handling', async () => {
  const user = new models.User(fixtures.User);
  assert.equal(user.email, 'user@example.com');
  assert.equal(user.toJSON().password, undefined);
  assert.equal(models.User.schema.path('password').options.select, false);
  await invalid('User', { role: 'customer' }, 'role');
  await invalid('User', { role: 'mechanic' }, 'employeeId');
  await invalid('User', { password: 'plaintext-password' }, 'password');
  await invalid('User', { email: 'invalid' }, 'email');
  await new models.User({ ...fixtures.User, role: 'mechanic', employeeId: 'M-1' }).validate();
  await new models.User({ ...fixtures.User, role: 'staff' }).validate();
});

test('Vehicle normalization, mileage and year limits', async () => {
  assert.equal(new models.Vehicle(fixtures.Vehicle).plateNumber, 'ABC 1234');
  await invalid('Vehicle', { currentMileage: -1 }, 'currentMileage');
  await invalid('Vehicle', { currentMileage: 0.5 }, 'currentMileage');
  await invalid('Vehicle', { plateNumber: '!!!' }, 'plateNumber');
  await invalid('Vehicle', { currentMileage: -1 }, 'currentMileage');
  await invalid('Vehicle', { currentMileage: 0.5 }, 'currentMileage');
  await invalid('Vehicle', { year: new Date().getUTCFullYear() + 2 }, 'year');
});

test('Service supports configurable or disabled reminders', async () => {
  await new models.Service({ ...fixtures.Service, maintenanceReminderInterval: 120 }).validate();
  await new models.Service({ ...fixtures.Service, checklistTemplate: ['Inspect pads', 'Check fluid'] }).validate();
  await invalid('Service', { maintenanceReminderInterval: 0 }, 'maintenanceReminderInterval');
  await invalid('Service', { estimatedPrice: -1 }, 'estimatedPrice');
  await invalid('Service', { estimatedDuration: 1.5 }, 'estimatedDuration');
  await invalid('Service', { checklistTemplate: Array.from({ length: 11 }, (_, index) => `Item ${index + 1}`) }, 'checklistTemplate');
  await invalid('Service', { checklistTemplate: ['Inspect pads', ' inspect PADS '] }, 'checklistTemplate');
  await invalid('Service', { checklistTemplate: ['   '] }, 'checklistTemplate.0');
});

test('Booking channels, statuses and real calendar dates', async () => {
  await new models.Booking({ ...fixtures.Booking, bookingType: 'walk-in' }).validate();
  await new models.Booking({ ...fixtures.Booking, bookingDate: '2028-02-29' }).validate();
  await invalid('Booking', { bookingDate: '2026-02-29' }, 'bookingDate');
  await invalid('Booking', { bookingTime: '24:00' }, 'bookingTime');
  await invalid('Booking', { status: 'deleted' }, 'status');
  await invalid('Booking', { client: 'invalid-id' }, 'client');
});

test('Booking requires a nonempty array of distinct service IDs and a schedule', async () => {
  await new models.Booking({ ...fixtures.Booking, services: [id(), id()] }).validate();
  for (const services of [undefined, null, [], [null], [id(), null], id()]) {
    await invalid('Booking', { services }, 'services');
  }
  const service = id();
  await invalid('Booking', { services: [service, service] }, 'services');
  await assert.rejects(new models.Booking({ ...fixtures.Booking, services: ['bad-id'] }).validate());
  await invalid('Booking', { schedule: undefined }, 'schedule');
  await invalid('Booking', { services: undefined, service: id() }, 'services');
});

test('Booking reservation intervals remain optional for legacy records and may be shortened on completion', async () => {
  const legacy = new models.Booking(fixtures.Booking);
  await legacy.validate();
  const valid = new models.Booking({ ...fixtures.Booking, reservedStartAt: new Date('2035-05-12T01:00:00Z'),
    reservedEndAt: new Date('2035-05-12T04:00:00Z'), estimatedDurationMinutes: 180 });
  await valid.validate();
  const invalid = new models.Booking({ ...fixtures.Booking, reservedStartAt: new Date('2035-05-12T01:00:00Z'),
    reservedEndAt: new Date('2035-05-12T03:00:00Z'), estimatedDurationMinutes: 180,
    status: 'completed', actualDurationMinutes: 120 });
  await invalid.validate();
  invalid.reservedEndAt = invalid.reservedStartAt;
  await assert.rejects(invalid.validate(), error => Boolean(error.errors?.reservedEndAt));
});

test('All approved booking statuses and both channels remain valid', async () => {
  const statuses = ['pending', 'confirmed', 'checked_in', 'mechanic_assigned', 'in_service',
    'final_inspection', 'ready_for_release', 'completed', 'cancelled', 'rejected', 'no_show'];
  for (const status of statuses) {
    for (const bookingType of ['online', 'walk-in']) {
      await new models.Booking({ ...fixtures.Booking, status, bookingType }).validate();
    }
  }
});

test('Schedule count stays within capacity on document validation', async () => {
  await invalid('Schedule', { currentBookingCount: 3 }, 'currentBookingCount');
  await invalid('Schedule', { currentBookingCount: -1 }, 'currentBookingCount');
  await invalid('Schedule', { maximumCapacity: 0 }, 'maximumCapacity');
});

test('Historical event dates remain chronological', async () => {
  await invalid('JobOrder', { startedAt: '2026-10-10', completedAt: '2026-10-09' }, 'completedAt');
  await invalid('JobOrder', { completedAt: '2026-10-10' }, 'completedAt');
  await invalid('MaintenanceReminder', { nextRecommendedServiceDate: '2026-10-09' }, 'nextRecommendedServiceDate');
});

test('OTP purpose, digest and attempt validation; JSON hides digest', async () => {
  const otp = new models.EmailOtp(fixtures.EmailOtp);
  assert.equal(otp.email, 'user@example.com');
  assert.equal(otp.toJSON().otpHash, undefined);
  assert.equal(models.EmailOtp.schema.path('otpHash').options.select, false);
  await invalid('EmailOtp', { otpHash: '123456' }, 'otpHash');
  await invalid('EmailOtp', { purpose: 'login' }, 'purpose');
  await invalid('EmailOtp', { attempts: -1 }, 'attempts');
});

test('Master archival retains IDs; only ephemeral OTP has a TTL index', async () => {
  for (const name of ['User', 'Vehicle', 'Service', 'ServiceBay']) {
    const doc = new models[name](fixtures[name]);
    const originalId = doc.id;
    doc.isArchived = true;
    doc.archivedAt = new Date();
    await doc.validate();
    assert.equal(doc.id, originalId);
  }
  for (const [name, Model] of Object.entries(models)) {
    const hasTTL = Model.schema.indexes().some(([, options]) => options.expireAfterSeconds !== undefined);
    assert.equal(hasTTL, name === 'EmailOtp');
  }
});
