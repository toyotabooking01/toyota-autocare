const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Service = require('../models/Service');
const ServiceBay = require('../models/ServiceBay');
const JobOrder = require('../models/JobOrder');
const Booking = require('../models/Booking');
const master = require('../services/masterDataService');

test('service and bay payloads accept only valid master fields', () => {
  assert.deepEqual(master.input('service', { name: '  General PMS ', estimatedDuration: 60, estimatedPrice: 0 }, true),
    { name: 'General PMS', estimatedDuration: 60, estimatedPrice: 0 });
  assert.deepEqual(master.input('service', { name: 'Brake Service', checklistTemplate: [' Inspect pads ', 'Check brake fluid'] }),
    { name: 'Brake Service', checklistTemplate: ['Inspect pads', 'Check brake fluid'] });
  for (const checklistTemplate of [[''], ['Inspect pads', ' inspect PADS '], Array.from({ length: 11 }, (_, index) => `Item ${index}`)]) {
    assert.throws(() => master.input('service', { checklistTemplate }), { status: 400 });
  }
  assert.equal(master.input('bay', { name: ' Bay 01 ', operationalStatus: 'maintenance' }, true).name, 'Bay 01');
  for (const body of [
    { name: 'Service', estimatedDuration: 0, estimatedPrice: 1 },
    { name: 'Service', estimatedDuration: 30.5, estimatedPrice: 1 },
    { name: 'Service', estimatedDuration: 30, estimatedPrice: -1 },
    { name: 'Service', estimatedDuration: 30, estimatedPrice: 1, isArchived: false },
  ]) assert.throws(() => master.input('service', body, true), { status: 400 });
  assert.throws(() => master.input('bay', { name: 'Bay 01', availability: 'available' }, true), { status: 400 });
  assert.throws(() => master.input('bay', { name: 'Bay 01', operationalStatus: 'invalid' }, true), { status: 400 });
});

test('list filters archived records and escapes search text', async () => {
  const original = Service.find;
  let filter;
  Service.find = query => { filter = query; return { sort: () => ({ lean: async () => [] }) }; };
  try {
    await master.list('service', { archive: 'archived', status: 'inactive', search: 'Oil.*' });
    assert.equal(filter.isArchived, true);
    assert.equal(filter.isActive, false);
    assert.equal(new RegExp(filter.name.$regex, 'i').test('Oil.* change'), true);
    assert.equal(new RegExp(filter.name.$regex, 'i').test('Oil X change'), false);
    await assert.rejects(master.list('service', { archive: 'invalid' }), { status: 400 });
  } finally { Service.find = original; }
});

test('duplicate service names are rejected without loading the catalog', async () => {
  const original = Service.exists;
  let filter;
  Service.exists = async query => { filter = query; return { _id: new mongoose.Types.ObjectId() }; };
  try {
    await assert.rejects(master.create('service', { name: 'Oil.*', estimatedDuration: 30, estimatedPrice: 500 }), { status: 409 });
    assert.equal(new RegExp(filter.name.$regex, 'i').test('oil.*'), true);
    assert.equal(new RegExp(filter.name.$regex, 'i').test('oil change'), false);
  } finally { Service.exists = original; }
});

test('bay assigned to unfinished work cannot be archived', async () => {
  const oldBay = ServiceBay.findById;
  const oldJob = JobOrder.exists;
  const oldBooking = Booking.exists;
  const item = { isArchived: false, archivedAt: null, save: async () => item };
  ServiceBay.findById = async () => item;
  JobOrder.exists = async () => ({ _id: new mongoose.Types.ObjectId() });
  Booking.exists = async () => null;
  try {
    await assert.rejects(master.setArchive('bay', String(new mongoose.Types.ObjectId()), true), { status: 409 });
    assert.equal(item.isArchived, false);
    assert.equal(item.archivedAt, null);
  } finally { ServiceBay.findById = oldBay; JobOrder.exists = oldJob; Booking.exists = oldBooking; }
});

test('bay archive and restore retain record identity', async () => {
  const oldBay = ServiceBay.findById;
  const oldJob = JobOrder.exists;
  const oldBooking = Booking.exists;
  const item = { isArchived: false, archivedAt: null, save: async () => item };
  ServiceBay.findById = async () => item;
  JobOrder.exists = async () => null;
  Booking.exists = async () => null;
  try {
    const recordId = String(new mongoose.Types.ObjectId());
    assert.equal(await master.setArchive('bay', recordId, true), item);
    assert.equal(item.isArchived, true);
    assert.ok(item.archivedAt instanceof Date);
    assert.equal(await master.setArchive('bay', recordId, false), item);
    assert.equal(item.isArchived, false);
    assert.equal(item.archivedAt, null);
  } finally { ServiceBay.findById = oldBay; JobOrder.exists = oldJob; Booking.exists = oldBooking; }
});
