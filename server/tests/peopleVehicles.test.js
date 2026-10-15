const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const authorize = require('../middleware/authorize');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const JobOrder = require('../models/JobOrder');
const Booking = require('../models/Booking');
const Counter = require('../models/Counter');
const emailService = require('../services/emailService');
const service = require('../services/peopleVehiclesService');
const toyotaCatalog = require('../services/toyotaCatalogService');

const id = () => String(new mongoose.Types.ObjectId());
const mechanicData = { firstName: 'Mechanic', lastName: 'A', email: 'Mech@Example.com', phone: '09171234567' };
const vehicleData = { make: 'Toyota', model: 'Vios', year: 2025, variant: '1.3 XLE CVT', plateNumber: 'abc1234', transmission: 'cvt', currentMileage: 1000 };

function access(role, allowed) {
  let nextError;
  authorize(...allowed)({ user: { role } }, {}, error => { nextError = error; });
  return nextError;
}
test('admin access is required for mechanics; client access is required for vehicles', () => {
  assert.equal(access('admin', ['admin']), undefined);
  assert.equal(access('client', ['admin']).status, 403);
  assert.equal(access('mechanic', ['admin']).status, 403);
  assert.equal(access('client', ['client']), undefined);
  assert.equal(access('admin', ['client']).status, 403);
  assert.equal(access('mechanic', ['client']).status, 403);
});

test('mechanic and vehicle payloads reject role and owner overrides', () => {
  assert.equal(service.mechanicInput(mechanicData, true).email, 'mech@example.com');
  assert.equal(service.mechanicInput(mechanicData, true).phone, '+639171234567');
  assert.equal('employeeId' in service.mechanicInput(mechanicData, true), false);
  assert.equal(service.vehicleInput(vehicleData, true).plateNumber, 'ABC 1234');
  assert.throws(() => service.mechanicInput({ ...mechanicData, role: 'admin' }, true), { status: 400 });
  assert.throws(() => service.mechanicInput({ ...mechanicData, availability: 'unknown' }, true), { status: 400 });
  assert.throws(() => service.mechanicInput({ ...mechanicData, password: 'StrongPassword123!' }, true), { status: 400 });
  assert.throws(() => service.mechanicInput({ ...mechanicData, employeeId: 'MECH-9000' }, true), { status: 400 });
  assert.throws(() => service.mechanicInput({ ...mechanicData, phone: '' }, true), { status: 400 });
  assert.throws(() => service.mechanicInput({ ...mechanicData, phone: '0917123456' }, true), { status: 400 });
  assert.throws(() => service.vehicleInput({ ...vehicleData, owner: id() }, true), { status: 400 });
  assert.throws(() => service.vehicleInput({ ...vehicleData, year: 1800 }, true), { status: 400 });
});

test('mechanic creation hashes a generated password, marks forced change, and emails credentials', async t => {
  const oldExists = User.exists;
  const oldCreate = User.create;
  const oldFind = User.findOne;
  const oldCounter = Counter.findOneAndUpdate;
  let created; let delivered;
  t.mock.method(emailService, 'ensureConfigured', () => {});
  t.mock.method(emailService, 'sendTemporaryPassword', async payload => { delivered = payload; });
  Counter.findOneAndUpdate = async () => ({ sequence: 1 });
  User.exists = async () => null;
  User.create = async data => { created = data; return { ...data, _id: id() }; };
  User.findOne = () => ({ select: () => ({ lean: async () => ({ _id: id(), fullName: created.fullName, email: created.email, employeeId: created.employeeId, role: created.role }) }) });
  try {
    const result = await service.mechanicCreate(mechanicData);
    assert.equal(created.role, 'mechanic');
    assert.equal(created.firstName, 'Mechanic');
    assert.equal(created.lastName, 'A');
    assert.equal(created.fullName, 'Mechanic A');
    assert.equal(created.status, 'active');
    assert.equal(created.availability, 'available');
    assert.equal(created.employeeId, 'MEC-0001');
    assert.equal(created.emailVerified, true);
    assert.equal(created.mustChangePassword, true);
    assert.equal(await bcrypt.compare(delivered.password, created.password), true);
    assert.equal(delivered.email, 'mech@example.com');
    assert.equal(delivered.accountType, 'mechanic');
    assert.equal(delivered.employeeId, created.employeeId);
    assert.equal(result.emailSent, true);
    assert.match(result.message, /Temporary sign-in details were sent/);
    assert.equal(result.password, undefined);
    assert.equal(result.item.password, undefined);
  } finally { User.exists = oldExists; User.create = oldCreate; User.findOne = oldFind; Counter.findOneAndUpdate = oldCounter; }
});

test('temporary credential email failure keeps one recoverable account and returns no password', async t => {
  const oldExists = User.exists; const oldCreate = User.create; const oldFind = User.findOne;
  const oldCounter = Counter.findOneAndUpdate;
  let attemptedPassword;
  t.mock.method(emailService, 'ensureConfigured', () => {});
  t.mock.method(emailService, 'sendTemporaryPassword', async payload => { attemptedPassword = payload.password; throw new Error('private SMTP detail'); });
  Counter.findOneAndUpdate = async () => ({ sequence: 2 });
  let created;
  User.exists = async () => null;
  User.create = async data => { created = data; return { _id: id() }; };
  User.findOne = () => ({ select: () => ({ lean: async () => ({ _id: id(), fullName: created.fullName, email: created.email, employeeId: created.employeeId, role: created.role }) }) });
  try {
    const result = await service.mechanicCreate(mechanicData);
    assert.equal(created.mustChangePassword, true);
    assert.equal(result.emailSent, false);
    assert.match(result.message, /Do not create another account/);
    assert.match(result.message, /Forgot password/);
    assert.equal(JSON.stringify(result).includes(attemptedPassword), false);
    assert.equal(result.password, undefined);
  } finally { User.exists = oldExists; User.create = oldCreate; User.findOne = oldFind; Counter.findOneAndUpdate = oldCounter; }
});

test('existing email prevents mechanic creation', async () => {
  const oldExists = User.exists;
  const oldCreate = User.create;
  let created = false;
  User.exists = async filter => filter.email ? { _id: id() } : null;
  User.create = async () => { created = true; };
  try {
    await assert.rejects(service.mechanicCreate(mechanicData), error => {
      assert.equal(error.status, 409);
      assert.equal(error.message, 'This email is already registered.');
      assert.equal(error.errors.email, 'This email is already registered.');
      return true;
    });
    assert.equal(created, false);
  } finally { User.exists = oldExists; User.create = oldCreate; }
});

test('concurrent mechanic ID allocation stays unique and does not reuse a deleted ID', async t => {
  let sequence = 0;
  const records = new Set();
  t.mock.method(Counter, 'findOneAndUpdate', async (filter, update, options) => {
    assert.deepEqual(filter, { _id: 'mechanicEmployeeId' });
    assert.deepEqual(update, { $inc: { sequence: 1 } });
    assert.equal(options.returnDocument, 'after');
    return { sequence: ++sequence };
  });
  t.mock.method(Counter, 'findById', () => ({ lean: async () => ({ sequence }) }));
  t.mock.method(User, 'exists', async filter => records.has(filter.employeeId));
  const issued = await Promise.all([1, 2, 3].map(() => service.nextMechanicEmployeeId()));
  assert.deepEqual(issued.sort(), ['MEC-0001', 'MEC-0002', 'MEC-0003']);
  issued.forEach(value => records.add(value));
  records.delete('MEC-0002');
  assert.equal(await service.previewMechanicId(), 'MEC-0004');
  assert.equal(await service.nextMechanicEmployeeId(), 'MEC-0004');
});

test('employee ID generation skips IDs already held by legacy accounts', async t => {
  const oldExists = User.exists; const oldCreate = User.create; const oldFind = User.findOne; const oldCounter = Counter.findOneAndUpdate;
  t.mock.method(emailService, 'ensureConfigured', () => {});
  t.mock.method(emailService, 'sendTemporaryPassword', async () => {});
  let sequence = 0; let created;
  Counter.findOneAndUpdate = async () => ({ sequence: ++sequence });
  User.exists = async filter => filter.employeeId === 'MEC-0001' ? { _id: id() } : null;
  User.create = async data => { created = data; return { _id: id() }; };
  User.findOne = () => ({ select: () => ({ lean: async () => ({ _id: id(), fullName: created.fullName, email: created.email, employeeId: created.employeeId, role: created.role }) }) });
  try {
    const result = await service.mechanicCreate(mechanicData);
    assert.equal(created.employeeId, 'MEC-0002');
    assert.equal(result.item.employeeId, 'MEC-0002');
  } finally { User.exists = oldExists; User.create = oldCreate; User.findOne = oldFind; Counter.findOneAndUpdate = oldCounter; }
});

test('mechanic archive blocks unfinished jobs, then archives and restores', async () => {
  const oldFind = User.findOne;
  const oldJob = JobOrder.exists;
  const oldBooking = Booking.exists;
  const mechanic = { role: 'mechanic', isArchived: false, archivedAt: null, availability: 'available', save: async () => mechanic };
  User.findOne = query => query.role === 'mechanic' ? { select: () => ({ lean: async () => ({ ...mechanic }) }), then: resolve => resolve(mechanic) } : null;
  JobOrder.exists = async () => ({ _id: id() });
  Booking.exists = async () => null;
  try {
    await assert.rejects(service.mechanicArchive(id(), true), { status: 409 });
    assert.equal(mechanic.isArchived, false);
    JobOrder.exists = async () => null;
    await service.mechanicArchive(id(), true);
    assert.equal(mechanic.isArchived, true);
    assert.ok(mechanic.archivedAt instanceof Date);
    assert.equal(mechanic.availability, 'off_duty');
    await service.mechanicArchive(id(), false);
    assert.equal(mechanic.isArchived, false);
    assert.equal(mechanic.archivedAt, null);
  } finally { User.findOne = oldFind; JobOrder.exists = oldJob; Booking.exists = oldBooking; }
});

test('vehicle creation uses authenticated owner and rejects duplicate normalized plate', async t => {
  t.mock.method(toyotaCatalog, 'validateSelection', async () => ({ _id: id() }));
  const oldExists = Vehicle.exists;
  const oldCreate = Vehicle.create;
  let created;
  Vehicle.exists = async () => null;
  Vehicle.create = async data => { created = data; return data; };
  try {
    const owner = id();
    await service.vehicleCreate(owner, vehicleData);
    assert.equal(created.owner, owner);
    assert.equal(created.plateNumber, 'ABC 1234');
    Vehicle.exists = async () => ({ _id: id() });
    await assert.rejects(service.vehicleCreate(owner, vehicleData), { status: 409 });
  } finally { Vehicle.exists = oldExists; Vehicle.create = oldCreate; }
});

test('vehicle get and update always constrain the query to the authenticated owner', async t => {
  t.mock.method(toyotaCatalog, 'validateSelection', async () => ({ _id: id() }));
  const oldFind = Vehicle.findOne;
  const oldExists = Vehicle.exists;
  let query;
  const own = { isArchived: false, save: async () => own };
  Vehicle.findOne = async filter => { query = filter; return filter.owner === 'owner-a' ? own : null; };
  Vehicle.exists = async () => null;
  const vehicleId = id();
  try {
    await assert.rejects(service.vehicleGet('owner-b', vehicleId), { status: 404 });
    assert.equal(query.owner, 'owner-b');
    await assert.rejects(service.vehicleUpdate('owner-a', vehicleId, { model: 'Corolla' }), { status: 400 });
    await service.vehicleUpdate('owner-a', vehicleId, vehicleData);
    assert.equal(query.owner, 'owner-a');
    assert.equal(own.model, 'Vios');
    await assert.rejects(service.vehicleUpdate('owner-b', vehicleId, { ...vehicleData, model: 'Prius' }), { status: 404 });
  } finally { Vehicle.findOne = oldFind; Vehicle.exists = oldExists; }
});

test('vehicle archive and restore keep the same owned record', async () => {
  const oldFind = Vehicle.findOne;
  const vehicle = { isArchived: false, archivedAt: null, save: async () => vehicle };
  Vehicle.findOne = async filter => filter.owner === 'owner-a' ? vehicle : null;
  try {
    const vehicleId = id();
    await service.vehicleArchive('owner-a', vehicleId, true);
    assert.equal(vehicle.isArchived, true);
    assert.ok(vehicle.archivedAt instanceof Date);
    await service.vehicleArchive('owner-a', vehicleId, false);
    assert.equal(vehicle.isArchived, false);
    assert.equal(vehicle.archivedAt, null);
    await assert.rejects(service.vehicleArchive('owner-b', vehicleId, true), { status: 404 });
  } finally { Vehicle.findOne = oldFind; }
});

test('historical vehicles without a catalog variant remain editable without rewriting identity', async t => {
  const oldVehicle = { make: 'Toyota', model: 'Vios', year: 2024, transmission: 'automatic',
    plateNumber: 'OLD1234', currentMileage: 9000, isArchived: false, save: async () => oldVehicle };
  t.mock.method(Vehicle, 'findOne', async () => oldVehicle);
  t.mock.method(Vehicle, 'exists', async () => null);
  const catalogLookup = t.mock.method(toyotaCatalog, 'validateSelection', async () => { throw new Error('Legacy identity must not be looked up'); });
  const updated = await service.vehicleUpdate('owner-a', id(), { make: 'Toyota', model: 'Vios', year: 2024,
    plateNumber: 'NEW1234', transmission: 'automatic', currentMileage: 9500 });
  assert.equal(updated.plateNumber, 'NEW 1234');
  assert.equal(updated.currentMileage, 9500);
  assert.equal(updated.variant, undefined);
  assert.equal(catalogLookup.mock.calls.length, 0);
});
