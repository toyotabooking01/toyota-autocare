const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const reports = require('../services/reportService');

const id = () => String(new mongoose.Types.ObjectId());

test('report range validates calendar dates, order, and bounded span', () => {
  assert.deepEqual(reports.range({ from: '2026-10-01', to: '2026-10-07' }), { from: '2026-10-01', to: '2026-10-07' });
  assert.throws(() => reports.range({ from: '2026-02-30', to: '2026-03-01' }), { status: 400 });
  assert.throws(() => reports.range({ from: '2026-10-08', to: '2026-10-07' }), { status: 400 });
  assert.throws(() => reports.range({ from: '2024-01-01', to: '2026-10-07' }), { status: 400 });
});

test('report summarizes statuses, channels, completed service estimates, workload, bays, and dates', () => {
  const serviceA = { _id: id(), name: 'PMS', estimatedPrice: 500 };
  const serviceB = { _id: id(), name: 'Brakes', estimatedPrice: 700 };
  const mechanicA = { _id: id(), fullName: 'Mechanic A' }; const mechanicB = { _id: id(), fullName: 'Mechanic B' };
  const bayA = { _id: id(), name: 'BAY 1' }; const bayB = { _id: id(), name: 'BAY 2' };
  const rows = [
    { bookingDate: '2026-10-01', status: 'completed', bookingType: 'online', services: [serviceA, serviceB], assignedMechanic: mechanicA, assignedServiceBay: bayA },
    { bookingDate: '2026-10-02', status: 'pending', bookingType: 'walk-in', services: [serviceA] },
    { bookingDate: '2026-10-02', status: 'in_service', bookingType: 'online', services: [serviceB], assignedMechanic: mechanicA, assignedServiceBay: bayA },
    { bookingDate: '2026-10-02', status: 'completed', bookingType: 'walk-in', services: [serviceA], assignedMechanic: mechanicB, assignedServiceBay: bayB },
  ];
  const report = reports.summarize(rows, { from: '2026-10-01', to: '2026-10-02' });
  assert.equal(report.totalBookings, 4);
  assert.equal(report.byStatus.completed, 2); assert.equal(report.byStatus.in_service, 1);
  assert.deepEqual(report.bySource, { online: 2, 'walk-in': 2 });
  assert.equal(report.completedBookings, 2); assert.equal(report.completedServices, 3);
  assert.equal(report.completedEstimate, 1700);
  assert.equal(report.servicePopularity[0].bookings, 3);
  assert.deepEqual(report.bookingsByDate.map(item => item.bookings), [1, 3]);
  assert.deepEqual(report.mechanicWorkload.find(item => item.name === 'Mechanic A'),
    { id: mechanicA._id, name: 'Mechanic A', assigned: 2, active: 1, completed: 1 });
  assert.deepEqual(report.serviceBayUsage.find(item => item.name === 'BAY 1'),
    { id: bayA._id, name: 'BAY 1', visits: 2, active: 1, completed: 1 });
  assert.equal(JSON.stringify(report).includes('client'), false);
});

test('report query filters scheduled visit dates and selects only aggregate inputs', async () => {
  const oldFind = Booking.find; let filter; let selection;
  Booking.find = query => { filter = query; return { select: fields => { selection = fields; return { populate: () => ({ lean: async () => [] }) }; } }; };
  try {
    const result = await reports.summary({ from: '2026-10-01', to: '2026-10-07' });
    assert.deepEqual(filter, { bookingDate: { $gte: '2026-10-01', $lte: '2026-10-07' } });
    assert.equal(selection.includes('client'), false);
    assert.equal(result.totalBookings, 0);
  } finally { Booking.find = oldFind; }
});
