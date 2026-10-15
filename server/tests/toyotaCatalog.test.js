const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { existsSync } = require('node:fs');
const path = require('node:path');
const ToyotaCatalog = require('../models/ToyotaCatalog');
const seedEntries = require('../data/toyotaPhilippinesCatalog');
const modelRules = require('../data/toyotaPhilippinesModels');
const modelImages = require('../data/toyotaModelImages');
const service = require('../services/toyotaCatalogService');
const people = require('../services/peopleVehiclesService');

const valid = { make: 'Toyota', model: 'Fortuner', year: 2025, variant: '2.4 G 4x2 AT',
  transmission: 'automatic', plateNumber: 'ABC1234', currentMileage: 1500 };

test('initial Toyota PH catalog has unique model/year/variant rows and all requested models', () => {
  const models = new Set(seedEntries.map(item => item.model));
  assert.deepEqual([...models].sort(), modelRules.map(item => item.model).sort());
  assert.equal(new Set(seedEntries.map(item => `${item.model}/${item.year}/${item.variant}`)).size, seedEntries.length);
  assert.ok(seedEntries.every(item => item.make === 'Toyota' && item.market === 'Philippines' && item.isActive));
  assert.ok(seedEntries.every(item => Number.isInteger(item.year)));
  assert.ok(seedEntries.every(item => item.category && item.seatingCapacity));
  assert.ok(seedEntries.every(item => item.variant === null || (item.fuelType && item.transmission)));
  assert.ok(seedEntries.every(item => item.imageUrl && /^\/toyota\//.test(item.imageUrl)));
  assert.ok(seedEntries.every(item => existsSync(path.join(__dirname, '../../client/public', item.imageUrl))));
  assert.ok(ToyotaCatalog.schema.indexes().some(([fields, options]) => fields.variant === 1 && options.unique));
  assert.ok(Object.values(modelImages).every(imageUrl => existsSync(path.join(__dirname, '../../client/public', imageUrl))));
  assert.equal(modelRules.length, Object.keys(modelImages).length);
  assert.ok(modelRules.every(rule => rule.imageUrl === modelImages[rule.model]));
});

test('historical variants belong only to their documented model and year', () => {
  const trims = (model, year) => seedEntries.filter(item => item.model === model && item.year === year).map(item => item.variant);
  assert.deepEqual(trims('Corolla', 2003).sort(), ['1.3 LE M/T', '1.3 XL M/T']);
  assert.equal(trims('Corolla Altis', 2003).length, 0);
  assert.equal(trims('Avanza', 2020).length, 6);
  assert.equal(trims('Avanza', 2025).includes('1.5 Veloz AT'), false);
  assert.equal(trims('HiAce', 2020).length, 8);
  assert.equal(trims('Hilux', 2020).length, 10);
  assert.equal(trims('Raize', 2023).length, 4);
  assert.equal(trims('Vios', 2023).length, 10);
  assert.equal(trims('Fortuner', 2023).length, 7);
  assert.equal(trims('Hilux', 2023).length, 10);
  assert.equal(trims('Wigo', 2023).length, 7);
  assert.equal(trims('HiAce', 2024).length, 9);
  assert.equal(trims('Raize', 2021).length, 0);
});

test('model years come only from distinct active catalog records', async t => {
  const rules = service.catalogModels([
    { model: 'Corolla Altis', year: 2026 }, { model: 'Corolla Altis', year: 2023 },
    { model: 'Corolla Altis', year: 2023 }, { model: 'Corolla Altis', year: 2008 },
    { model: 'Raize', year: 2023 },
  ]);
  assert.deepEqual(rules.find(item => item.model === 'Corolla Altis').years, [2026, 2023, 2008]);
  assert.deepEqual(rules.find(item => item.model === 'Raize').years, [2023]);
  assert.equal(rules.some(item => item.model === '86'), false);
  assert.ok(rules.every(item => item.years.length > 0 && item.imageUrl));
  const distinct = t.mock.method(ToyotaCatalog, 'distinct', async () => [2008, 2026, 2023, 2023]);
  assert.deepEqual(await service.years(' TOYOTA COROLLA ALTIS '), [2026, 2023, 2008]);
  assert.deepEqual(distinct.mock.calls[0].arguments[1], {
    make: 'Toyota', market: 'Philippines', isActive: true,
    model: { $regex: '^Corolla Altis$', $options: 'i' },
  });
});

test('catalog seed inserts rows and repairs only missing images', async t => {
  t.mock.method(ToyotaCatalog, 'distinct', async () => ['Hiace']);
  const normalize = t.mock.method(ToyotaCatalog, 'updateMany', async () => ({}));
  const calls = t.mock.method(ToyotaCatalog, 'bulkWrite', async operations => operations);
  await service.seed();
  assert.equal(normalize.mock.callCount(), 1);
  assert.equal(normalize.mock.calls[0].arguments[1].$set.model, 'HiAce');
  assert.equal(calls.mock.calls[0].arguments[0].length, seedEntries.length);
  assert.ok(calls.mock.calls[0].arguments[0].every(operation => operation.updateOne.upsert
    && '$setOnInsert' in operation.updateOne.update && !('$set' in operation.updateOne.update)));
  assert.ok(calls.mock.calls[0].arguments[0].filter(operation => operation.updateOne.update.$setOnInsert.model === 'HiAce').length > 0);
  assert.ok(calls.mock.calls[1].arguments[0].every(operation => operation.updateMany.filter.imageUrl.$in.includes('')
    && operation.updateMany.update.$set.imageUrl));
  assert.equal(calls.mock.calls[2].arguments[0].length, modelRules.length);
  assert.ok(calls.mock.calls[2].arguments[0].every(operation => operation.updateMany.filter.modelImageUrl.$in.includes('')
    && operation.updateMany.update.$set.modelImageUrl));
});

test('model normalization accepts casing, spaces, and Toyota prefix', () => {
  assert.equal(service.normalizeModel('  TOYOTA   VIOS  '), 'Vios');
  assert.equal(service.normalizeModel('vios'), 'Vios');
  assert.equal(service.normalizeModel('supra'), 'GR Supra');
  assert.equal(service.normalizeModel('AF86'), 'AF86');
  assert.equal(service.normalizeModel('  TOYOTA GL GRANDIA TOURER  '), 'HiAce');
  assert.equal(service.normalizeModel('Hilux Fleet'), 'Hilux');
  assert.equal(service.normalizeModel('bZ4X'), 'bZ4X');
});

test('CarAPI fallback accepts only exact Toyota model and year photos', async t => {
  const previousToken = process.env.CARAPI_TOKEN;
  process.env.CARAPI_TOKEN = 'test-token';
  t.after(() => { if (previousToken === undefined) delete process.env.CARAPI_TOKEN; else process.env.CARAPI_TOKEN = previousToken; });
  const vin = 'JT123456789012345';
  const fetchCall = t.mock.method(global, 'fetch', async url => {
    if (String(url).includes('/v1/listing')) return { ok: true, json: async () => ({ listings: [
      { vin, specifications: { make: 'Toyota', model: 'Other', registrationDate: '2023-01-01' }, availability: { imagesCount: 1 } },
      { vin, specifications: { make: 'Toyota', model: 'Vios', registrationDate: '2023-01-01' }, availability: { imagesCount: 1 } },
    ] }) };
    return { ok: true, json: async () => ({ photos: ['https://images.carapi.dev/vehicles/example/front.jpg'] }) };
  });
  assert.equal(await service.externalImage('Vios', 2023), 'https://images.carapi.dev/vehicles/example/front.jpg');
  assert.equal(await service.externalImage('AF86', 1986), '');
  assert.equal(fetchCall.mock.callCount(), 2);
});

test('vehicle selection rejects other makes, unknown models, wrong years, variants, and transmission', async t => {
  const entry = { _id: new mongoose.Types.ObjectId(), ...valid };
  t.mock.method(ToyotaCatalog, 'distinct', async (field, filter) => {
    if (field !== 'year') return [];
    if (filter.model.$regex === '^Fortuner$') return [2025];
    if (filter.model.$regex === '^Avanza$') return [2020];
    return [];
  });
  t.mock.method(ToyotaCatalog, 'find', filter => ({ select: () => ({ sort: () => ({ lean: async () =>
    new RegExp(filter.model.$regex, 'i').test(entry.model) && filter.year === entry.year ? [entry] : [] }) }) }));
  assert.equal((await service.validateSelection(valid))._id, entry._id);
  await assert.rejects(service.validateSelection({ ...valid, make: 'Honda' }), { status: 400, errors: { make: 'Select Toyota.' } });
  await assert.rejects(service.validateSelection({ ...valid, model: 'Unknown' }), { status: 400 });
  await assert.rejects(service.validateSelection({ ...valid, year: 2024 }), { status: 400 });
  await assert.rejects(service.validateSelection({ ...valid, year: 2004 }), { status: 400 });
  await assert.rejects(service.validateSelection({ ...valid, model: 'Raize', year: 2018 }), { status: 400 });
  await assert.rejects(service.validateSelection({ ...valid, model: '86', year: 2025 }), { status: 400 });
  await assert.rejects(service.validateSelection({ ...valid, model: 'Urban Cruiser', year: 2025 }), { status: 400 });
  await assert.rejects(service.validateSelection({ ...valid, variant: 'Unknown trim' }), { status: 400 });
  await assert.rejects(service.validateSelection({ ...valid, variant: '' }), { status: 400 });
  await assert.rejects(service.validateSelection({ ...valid, transmission: 'manual' }), { status: 400 });
  await assert.rejects(service.validateSelection({ ...valid, model: 'Avanza', year: 2020, variant: '' }), { status: 400 });
  assert.throws(() => people.vehicleInput({ ...valid, make: 'Ford' }, true), { status: 400 });
  assert.equal(people.vehicleInput({ ...valid, model: '  TOYOTA VIOS ' }, true).model, 'Vios');
});

test('a verified year without trim data accepts null variant and chosen transmission', async t => {
  const entry = { _id: new mongoose.Types.ObjectId(), make: 'Toyota', model: '86', year: 2020,
    variant: null, imageUrl: '/toyota/86.webp' };
  t.mock.method(ToyotaCatalog, 'distinct', async () => [2020]);
  t.mock.method(ToyotaCatalog, 'find', () => ({ select: () => ({ sort: () => ({ lean: async () => [entry] }) }) }));
  const vehicle = { ...valid, model: '86', year: 2020, variant: null, transmission: 'manual' };
  assert.equal((await service.validateSelection(vehicle))._id, entry._id);
  await assert.rejects(service.validateSelection({ ...vehicle, variant: 'Invented trim' }), { status: 400 });
  assert.equal(people.vehicleInput({ ...vehicle, variant: '' }, true).variant, null);
});
