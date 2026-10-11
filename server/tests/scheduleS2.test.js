const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Schedule = require('../models/Schedule');
const Service = require('../models/Service');
const resources = require('../services/resourceAvailabilityService');
const schedules = require('../services/scheduleService');

const objectId = () => new mongoose.Types.ObjectId();

test('working hours are optional for historical schedules and bound new reservations', () => {
  const period = resources.intervalFor('2035-05-12', '09:00', 120);
  assert.equal(schedules.withinWorkingHours({ date: '2035-05-12', timeSlot: '09:00' }, period), true);
  assert.equal(schedules.withinWorkingHours({ date: '2035-05-12', timeSlot: '09:00', openingTime: '08:00', closingTime: '11:00' }, period), true);
  assert.equal(schedules.withinWorkingHours({ date: '2035-05-12', timeSlot: '09:00', openingTime: '08:00', closingTime: '10:00' }, period), false);
  assert.throws(() => schedules.input({ openingTime: '17:00', closingTime: '08:00' }), { status: 400 });
});

test('schedule generator validates range, days, hours and interval', () => {
  const valid = { startDate: '2035-05-12', endDate: '2035-05-12', workingDays: [6], openingTime: '08:00', closingTime: '17:00', slotIntervalMinutes: 60, maximumCapacity: 4 };
  assert.deepEqual(schedules.generatorInput(valid), valid);
  assert.throws(() => schedules.generatorInput({ ...valid, startDate: '2000-01-01' }), { status: 400 });
  assert.throws(() => schedules.generatorInput({ ...valid, endDate: '2035-05-11' }), { status: 400 });
  assert.throws(() => schedules.generatorInput({ ...valid, closingTime: '08:00' }), { status: 400 });
  assert.throws(() => schedules.generatorInput({ ...valid, workingDays: [] }), { status: 400 });
});

test('generator creates interval slots for working dates and upserts without duplicates', async () => {
  const oldBulkWrite = Schedule.bulkWrite;
  let operations;
  Schedule.bulkWrite = async value => { operations = value; return { upsertedCount: value.length }; };
  try {
    const result = await schedules.generate({ startDate: '2035-05-12', endDate: '2035-05-13', workingDays: [6], openingTime: '08:00', closingTime: '10:00', slotIntervalMinutes: 60, maximumCapacity: 3 });
    assert.deepEqual(result, { generatedCount: 2, existingCount: 0, totalSlots: 2 });
    assert.deepEqual(operations.map(item => item.updateOne.filter), [
      { date: '2035-05-12', timeSlot: '08:00' }, { date: '2035-05-12', timeSlot: '09:00' },
    ]);
    assert.equal(operations[0].updateOne.update.$setOnInsert.openingTime, '08:00');
    assert.equal(operations[0].updateOne.update.$setOnInsert.closingTime, '10:00');
    assert.equal(operations[0].updateOne.upsert, true);
  } finally { Schedule.bulkWrite = oldBulkWrite; }
});

test('availability returns only future time slots fitting the duration, capacity and resource window', async () => {
  const oldServiceFind = Service.find;
  const oldScheduleFind = Schedule.find;
  const oldFit = resources.availabilityForPeriods;
  const serviceId = objectId();
  const service = { _id: serviceId, estimatedDuration: 90 };
  const date = '2099-05-12';
  const slots = [
    { _id: objectId(), date, timeSlot: '08:00', openingTime: '08:00', closingTime: '10:00', maximumCapacity: 4, currentBookingCount: 0, isEnabled: true },
    { _id: objectId(), date, timeSlot: '09:00', openingTime: '08:00', closingTime: '10:00', maximumCapacity: 4, currentBookingCount: 0, isEnabled: true },
    { _id: objectId(), date, timeSlot: '08:30', openingTime: '08:00', closingTime: '10:00', maximumCapacity: 4, currentBookingCount: 4, isEnabled: true },
  ];
  Service.find = () => ({ select: () => ({ lean: async () => [service] }) });
  Schedule.find = () => ({ sort: () => ({ lean: async () => slots }) });
  resources.availabilityForPeriods = async periods => periods.map((_, index) => ({ available: index === 0, mechanics: { minimumFree: index === 0 ? 2 : 0 }, serviceBays: { minimumFree: 1 } }));
  try {
    const result = await schedules.availability({ serviceIds: [String(serviceId)], fromDate: date, toDate: date });
    assert.equal(result.dates[0].available, true);
    assert.equal(result.dates[0].slots.length, 2); // 09:00 ends after closing and is excluded.
    assert.equal(result.dates[0].slots[0].time, '08:00');
    assert.equal(result.dates[0].slots[0].estimatedEndTime, '09:30');
    assert.equal(result.dates[0].slots[0].mechanicCount, 2);
    assert.equal(result.dates[0].slots[0].serviceBayCount, 1);
    assert.equal(result.dates[0].slots[1].available, false); // Full-capacity starts stay visible but cannot be selected.
  } finally { Service.find = oldServiceFind; Schedule.find = oldScheduleFind; resources.availabilityForPeriods = oldFit; }
});
