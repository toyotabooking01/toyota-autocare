const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Service = require('../models/Service');
const ServiceBay = require('../models/ServiceBay');
const JobOrder = require('../models/JobOrder');
const Booking = require('../models/Booking');
const master = require('../services/masterDataService');
const { backfillLegacyServiceTypes } = require('../services/serviceTypeMigration');

test('service and bay payloads accept only valid master fields', () => {
  assert.deepEqual(master.input('service', { name: '  General PMS ', type: 'Maintenance', estimatedDuration: 60, estimatedPrice: 0 }, true),
    { name: 'General PMS', type: 'Maintenance', estimatedDuration: 60, estimatedPrice: 0 });
  assert.deepEqual(master.input('service', { name: 'Brake Service', checklistTemplate: [' Inspect pads ', 'Check brake fluid'] }),
    { name: 'Brake Service', checklistTemplate: ['Inspect pads', 'Check brake fluid'] });
  for (const checklistTemplate of [[''], ['Inspect pads', ' inspect PADS '], Array.from({ length: 11 }, (_, index) => `Item ${index}`)]) {
    assert.throws(() => master.input('service', { checklistTemplate }), { status: 400 });
  }
  assert.equal(master.input('bay', { name: ' Bay 01 ', operationalStatus: 'maintenance' }, true).name, 'Bay 01');
  for (const body of [
    { name: 'Service', estimatedDuration: 30, estimatedPrice: 1 },
    { name: 'Service', type: 'Other', estimatedDuration: 30, estimatedPrice: 1 },
    { name: 'Service', estimatedDuration: 0, estimatedPrice: 1 },
    { name: 'Service', estimatedDuration: 30.5, estimatedPrice: 1 },
    { name: 'Service', estimatedDuration: 30, estimatedPrice: -1 },
    { name: 'Service', estimatedDuration: 30, estimatedPrice: 1, isArchived: false },
  ]) assert.throws(() => master.input('service', body, true), { status: 400 });
  assert.throws(() => master.input('bay', { name: 'Bay 01', availability: 'available' }, true), { status: 400 });
  assert.throws(() => master.input('bay', { name: 'Bay 01', operationalStatus: 'invalid' }, true), { status: 400 });
});

test('legacy service type backfill uses the existing Other workflow flag only for missing types', async () => {
  const original = Service.updateMany;
  const calls = [];
  Service.updateMany = async (filter, update) => { calls.push({ filter, update }); return { modifiedCount: 1 }; };
  try {
    assert.deepEqual(await backfillLegacyServiceTypes(), { diagnostic: 1, maintenance: 1 });
    assert.deepEqual(calls, [
      { filter: { $or: [{ type: { $exists: false } }, { type: null }], isOtherService: true }, update: { $set: { type: 'Diagnostic' } } },
      { filter: { $or: [{ type: { $exists: false } }, { type: null }], isOtherService: { $ne: true } }, update: { $set: { type: 'Maintenance' } } },
    ]);
  } finally { Service.updateMany = original; }
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

test('bay list reports operational and job-derived occupancy separately', async () => {
  const oldBays = ServiceBay.find; const oldJobs = JobOrder.find; const oldBookings = Booking.find;
  const freeId = String(new mongoose.Types.ObjectId()); const busyId = String(new mongoose.Types.ObjectId());
  const bookingId = String(new mongoose.Types.ObjectId()); const jobId = String(new mongoose.Types.ObjectId());
  ServiceBay.find = () => ({ sort: () => ({ lean: async () => [
    { _id: freeId, name: 'BAY 1', operationalStatus: 'operational', availability: 'occupied' },
    { _id: busyId, name: 'BAY 2', operationalStatus: 'operational', availability: 'available' },
  ] }) });
  JobOrder.find = () => ({ select: () => ({ lean: async () => [
    { _id: jobId, serviceBay: busyId, booking: bookingId, status: 'in_progress' },
  ] }) });
  Booking.find = () => ({ select: () => ({ populate: () => ({ lean: async () => [
    { _id: bookingId, assignedServiceBay: busyId, status: 'in_service', vehicle: { plateNumber: 'ABC 1234' } },
  ] }) }) });
  try {
    const bays = await master.list('bay', {});
    assert.equal(bays[0].availability, 'available');
    assert.equal(bays[0].operationalStatus, 'operational');
    assert.equal(bays[1].availability, 'occupied');
    assert.equal(String(bays[1].activeAssignments[0].jobOrderId), jobId);
    assert.equal(bays[1].activeAssignments[0].vehiclePlate, 'ABC 1234');
  } finally { ServiceBay.find = oldBays; JobOrder.find = oldJobs; Booking.find = oldBookings; }
});

test('duplicate service names are rejected without loading the catalog', async () => {
  const original = Service.exists;
  let filter;
  Service.exists = async query => { filter = query; return { _id: new mongoose.Types.ObjectId() }; };
  try {
    await assert.rejects(master.create('service', { name: 'Oil.*', type: 'Maintenance', estimatedDuration: 30, estimatedPrice: 500 }), { status: 409 });
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
