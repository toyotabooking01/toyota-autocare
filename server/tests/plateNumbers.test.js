const { test } = require('node:test');
const assert = require('node:assert/strict');
const { canonicalPlateNumber, normalizePlateInput, hasUnsupportedPlateSymbols } = require('../../shared/accountValidation.mjs');
const { duplicatePlateFilter } = require('../utils/plateNumbers');
const people = require('../services/peopleVehiclesService');
const Vehicle = require('../models/Vehicle');

test('standard formats normalize consistently and reject every invalid example', () => {
  for (const input of ['ABC1234', 'ABC 1234', 'abc 1234', ' abc1234 ', 'ABC   1234']) {
    assert.equal(canonicalPlateNumber(input), 'ABC 1234');
    assert.equal(normalizePlateInput(input), 'ABC 1234');
  }
  assert.equal(canonicalPlateNumber('abc123'), 'ABC 123');
  for (const input of ['DSDSADADASDAD', 'ABCD 1234', 'ABC 12345', 'ABCDEF', '1234567', 'A12345678', '123456789', 'ABC-123-XYZ', 'AAAA 12345', 'ABC@1234', 'ABC_1234', 'ABC-1234', 'AB C1234', 'ABC 12', '']) {
    assert.equal(canonicalPlateNumber(input), '', input);
    assert.throws(() => people.vehicleInput({ plateNumber: input }), { status: 400 });
  }
  assert.equal(normalizePlateInput('abc@1234'), 'ABC 1234');
  assert.equal(hasUnsupportedPlateSymbols('abc@1234'), true);
});

test('legacy compatibility only preserves the existing supported special record', async () => {
  const options = { existingPlate: 'ABC12' };
  assert.equal(canonicalPlateNumber('abc 12', options), 'ABC 12');
  for (const input of ['XYZ12', 'ABC00', 'A12345678']) assert.equal(canonicalPlateNumber(input, options), '');
  assert.equal(people.vehicleInput({ plateNumber: 'abc12' }, false, false, options).plateNumber, 'ABC 12');
  assert.throws(() => people.vehicleInput({ plateNumber: 'XYZ12' }, false, false, options), { status: 400 });
  const data = { owner: '111111111111111111111111', make: 'Toyota', model: 'Vios', year: 2020, transmission: 'automatic', plateNumber: 'ABC 12' };
  await assert.rejects(new Vehicle(data).validate());
  const existing = Vehicle.hydrate(data);
  await existing.validate();
  existing.plateNumber = 'XYZ 12';
  await assert.rejects(existing.validate());
});

test('duplicate lookup matches case, compact and historical separator spellings, excluding own ID', () => {
  const filter = duplicatePlateFilter(' abc1234 ', 'own-id');
  const regex = new RegExp(filter.plateNumber.$regex, filter.plateNumber.$options);
  for (const stored of ['ABC1234', 'ABC 1234', 'abc 1234', 'ABC-1234']) assert.equal(regex.test(stored), true);
  assert.equal(regex.test('XYZ 1234'), false);
  assert.deepEqual(filter._id, { $ne: 'own-id' });
});

test('edit allows its own unchanged plate and rejects another vehicle with the same normalized plate', async t => {
  const own = { _id: '111111111111111111111111', make: 'Toyota', model: 'Vios', year: 2020, plateNumber: 'ABC1234', transmission: 'automatic', currentMileage: 0, isArchived: false, save: async () => own };
  t.mock.method(Vehicle, 'findOne', async () => own);
  let another = false;
  t.mock.method(Vehicle, 'exists', async filter => {
    assert.deepEqual(filter._id, { $ne: own._id });
    return another ? { _id: '222222222222222222222222' } : null;
  });
  const payload = { make: own.make, model: own.model, year: own.year, plateNumber: 'abc1234', transmission: own.transmission, currentMileage: 0 };
  await people.vehicleUpdate('owner', own._id, payload);
  assert.equal(own.plateNumber, 'ABC 1234');
  another = true;
  await assert.rejects(people.vehicleUpdate('owner', own._id, payload), { status: 409, message: 'This plate number is already registered.' });
});
