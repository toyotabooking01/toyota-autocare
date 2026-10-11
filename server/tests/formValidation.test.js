const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateForm } = require('../utils/formValidation.mjs');
const auth = require('../utils/authValidation');
const people = require('../services/peopleVehiclesService');
const master = require('../services/masterDataService');
const schedule = require('../services/scheduleService');
const jobs = require('../services/jobOrderService');
const errorHandler = require('../middleware/errorHandler');
const Service = require('../models/Service');

const profile = { termsAccepted: true, firstName: "María", lastName: 'Santos', fullName: ' María Santos ', email: ' MARIA@example.com ', phone: '+639171234567', password: 'A secure passphrase 42!', confirmPassword: 'A secure passphrase 42!' };
function fieldError(fn, field) {
  assert.throws(fn, error => error.status === 400 && Boolean(error.errors?.[field]));
}

test('registration rejects bypassed missing confirmation, whitespace passwords, invalid names and PH mobiles', () => {
  for (const fullName of ['', '  ', '12345', '---']) fieldError(() => auth.registration({ ...profile, firstName: fullName }), 'firstName');
  for (const phone of ['1234567', '+1 202 555 0123', '08171234567', '+6309171234567', '091712345678']) fieldError(() => auth.registration({ ...profile, phone }), 'phone');
  for (const phone of ['09171234567', '+639171234567']) assert.equal(auth.registration({ ...profile, phone }).phone, '+639171234567');
  fieldError(() => auth.registration({ ...profile, confirmPassword: undefined }), 'confirmPassword');
  fieldError(() => auth.registration({ ...profile, password: ' '.repeat(12), confirmPassword: ' '.repeat(12) }), 'password');
  assert.equal(auth.registration(profile).fullName, 'María Santos');
  assert.equal(auth.registration(profile).email, 'maria@example.com');
  assert.deepEqual(validateForm('register', profile, { browser: true }), {});
});

test('login preserves existing short passwords but rejects empty passwords and unsafe email values', () => {
  assert.equal(auth.credentials({ email: profile.email, password: 'old' }).password, 'old');
  fieldError(() => auth.credentials({ email: profile.email, password: '  ' }), 'password');
  for (const email of ['a@b', '.x@example.com', 'x..y@example.com', 'x@example..com', 'x@-example.com', 'x,y@example.com', 'x@example.com\nBcc:test', { $ne: null }]) fieldError(() => auth.email(email), 'email');
  fieldError(() => auth.password('😀'.repeat(19)), 'password');
});

test('mechanic and vehicle validation rejects invalid partial updates with field errors', () => {
  fieldError(() => people.mechanicInput({ fullName: '123' }), 'fullName');
  assert.throws(() => people.mechanicInput({ employeeId: 'MECH / 1' }), { status: 400 });
  fieldError(() => people.mechanicInput({ phone: '' }), 'phone');
  const vehicle = { make: 'Toyota', model: 'Vios', year: 2025, plateNumber: 'ABC1234', transmission: 'automatic', currentMileage: 1200 };
  fieldError(() => people.vehicleInput({ ...vehicle, currentMileage: Number.MAX_SAFE_INTEGER + 1 }, true, true), 'currentMileage');
  fieldError(() => people.vehicleInput({ ...vehicle, year: '2025' }, true, true), 'year');
  fieldError(() => people.vehicleInput({ ...vehicle, year: new Date().getUTCFullYear() + 1 }, true, true), 'year');
  fieldError(() => people.vehicleInput({ ...vehicle, make: '   ' }, true, true), 'make');
  fieldError(() => people.vehicleInput({ ...vehicle, make: 'x'.repeat(81) }, true, true), 'make');
  fieldError(() => people.vehicleInput({ ...vehicle, model: '   ' }, true, true), 'model');
  fieldError(() => people.vehicleInput({ ...vehicle, transmission: 'unknown' }, true, true), 'transmission');
  fieldError(() => people.vehicleInput({ ...vehicle, currentMileage: -1 }, true, true), 'currentMileage');
  fieldError(() => people.vehicleInput({ ...vehicle, currentMileage: 1.5 }, true, true), 'currentMileage');
  for (const key of Object.keys(vehicle)) fieldError(() => people.vehicleInput(Object.fromEntries(Object.entries(vehicle).filter(([field]) => field !== key)), true, true), key);
  assert.equal(people.vehicleInput({ ...vehicle, plateNumber: ' abc-1234 ' }, true, true).plateNumber, 'ABC1234');
});

test('numeric form strings are validated before conversion and API requires actual numbers', () => {
  const form = { name: 'Oil change', estimatedDuration: '60', estimatedPrice: '0', maintenanceReminderInterval: '' };
  assert.deepEqual(validateForm('service', form, { browser: true }), {});
  assert.ok(validateForm('service', { ...form, estimatedPrice: '   ' }, { browser: true }).estimatedPrice);
  for (const estimatedPrice of [-1, Infinity, NaN, '20']) fieldError(() => master.input('service', { estimatedPrice }), 'estimatedPrice');
  fieldError(() => schedule.input({ maximumCapacity: 10001 }), 'maximumCapacity');
  assert.deepEqual(master.input('service', { maintenanceReminderInterval: null }), { maintenanceReminderInterval: null });
});

test('calendar dates, report chronology and range bounds agree in the browser', () => {
  assert.ok(validateForm('schedule', { date: '2026-02-30' }, { partial: true, browser: true }).date);
  assert.ok(validateForm('report', { from: '2026-10-10', to: '2026-10-09' }).to);
  assert.ok(validateForm('report', { from: '2024-01-01', to: '2026-01-01' }).to);
  assert.deepEqual(validateForm('report', { from: '2024-02-29', to: '2024-02-29' }), {});
});

test('booking selections and checklist content reject malformed, duplicate and oversized input', () => {
  const id = '123456789012345678901234';
  assert.ok(validateForm('booking', { vehicle: id, schedule: id, services: [id, id] }).services);
  assert.ok(validateForm('booking', { vehicle: 'bad', schedule: id, services: [id] }).vehicle);
  fieldError(() => jobs.workInput({ mechanicNotes: 'x'.repeat(5001) }), 'mechanicNotes');
  fieldError(() => jobs.workInput({ serviceChecklist: [{ description: '  ', isCompleted: false }] }), 'serviceChecklist');
  assert.deepEqual(jobs.workInput({ mechanicNotes: '', serviceChecklist: [] }), { mechanicNotes: '', serviceChecklist: [] });
});

test('duplicate database errors identify fields without disclosing duplicate values', () => {
  for (const [key, field] of [['email', 'email'], ['plateNumber', 'plateNumber'], ['nameKey', 'name'], ['timeSlot', 'timeSlot']]) {
    let response;
    const res = { status(code) { assert.equal(code, 409); return this; }, json(body) { response = body; } };
    errorHandler({ code: 11000, keyValue: { [key]: 'PRIVATE VALUE' } }, {}, res, () => {});
    assert.ok(response.errors[field]);
    assert.ok(!JSON.stringify(response).includes('PRIVATE VALUE'));
  }
});

test('new services get a case-insensitive unique key while the index leaves legacy records intact', async () => {
  const item = new Service({ name: ' Oil Change ', estimatedDuration: 60, estimatedPrice: 0 });
  await item.validate();
  assert.equal(item.nameKey, 'oil change');
  assert.ok(Service.schema.indexes().some(([keys, options]) => keys.nameKey === 1 && options.unique && options.sparse));
});
