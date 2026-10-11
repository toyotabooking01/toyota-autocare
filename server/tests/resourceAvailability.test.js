const { test } = require('node:test');
const assert = require('node:assert/strict');
const resources = require('../services/resourceAvailabilityService');

const period = resources.intervalFor('2035-05-12', '09:00', 180);
const mechanics = count => Array.from({ length: count }, (_, index) => ({ _id: `mechanic-${index + 1}`,
  role: 'mechanic', status: 'active', isArchived: false, availability: 'available' }));
const bays = count => Array.from({ length: count }, (_, index) => ({ _id: `bay-${index + 1}`,
  operationalStatus: 'operational', isArchived: false, availability: 'available' }));
const reserve = (start, end, resourceId) => ({ startAt: new Date(start), endAt: new Date(end), resourceId });

test('service durations sum across multiple selected Services', () => {
  assert.equal(resources.calculateTotalDuration([{ estimatedDuration: 180 }, { estimatedDuration: 120 }]), 300);
  assert.throws(() => resources.calculateTotalDuration([{ estimatedDuration: 0 }]), /positive whole number/);
  const interval = resources.intervalFor('2035-05-12', '09:00', 300);
  assert.equal(interval.endAt.toISOString(), '2035-05-12T06:00:00.000Z');
});

test('a busy Mechanic does not block other eligible Mechanics during the same period', () => {
  const state = resources.assessAvailability({ mechanics: mechanics(5), serviceBays: bays(2),
    jobs: [{ mechanic: 'mechanic-1', serviceBay: 'bay-1', reservedStartAt: new Date('2035-05-12T01:00:00Z'), reservedEndAt: new Date('2035-05-12T02:00:00Z') }] }, period);
  assert.equal(state.available, true);
  assert.equal(state.mechanics.continuousResources, 4);
  assert.equal(state.mechanics.minimumFree, 4);
  assert.equal(state.serviceBays.continuousResources, 1);
});

test('a busy Mechanic without a timed reservation is conservatively excluded from the available count', () => {
  const pool = mechanics(5); pool[0].availability = 'busy';
  const state = resources.assessAvailability({ mechanics: pool, serviceBays: bays(2), bookings: [], jobs: [] }, period);
  assert.equal(state.available, true);
  assert.equal(state.mechanics.minimumFree, 4);
});

test('generic reservations reduce available Mechanic and Bay capacity without blocking the whole period', () => {
  const state = resources.assessAvailability({ mechanics: mechanics(5), serviceBays: bays(3), bookings: [
    { _id: 'booking-1', reservedStartAt: new Date('2035-05-12T01:30:00Z'), reservedEndAt: new Date('2035-05-12T02:30:00Z') },
  ] }, period);
  assert.equal(state.mechanics.minimumFree, 4);
  assert.equal(state.serviceBays.minimumFree, 2);
  assert.equal(state.available, true);
});

test('one operational Bay is enough, but a fully occupied Bay pool rejects the period', () => {
  const busyJob = { mechanic: 'mechanic-1', serviceBay: 'bay-1',
    reservedStartAt: new Date('2035-05-12T01:00:00Z'), reservedEndAt: new Date('2035-05-12T04:00:00Z') };
  assert.equal(resources.assessAvailability({ mechanics: mechanics(2), serviceBays: bays(2), jobs: [busyJob] }, period).available, true);
  const state = resources.assessAvailability({ mechanics: mechanics(2), serviceBays: bays(1), jobs: [busyJob] }, period);
  assert.equal(state.serviceBays.available, false);
  assert.equal(state.available, false);
});

test('a resource must be free for the entire interval, not just part of it', () => {
  const state = resources.assessAvailability({ mechanics: mechanics(2), serviceBays: bays(1), jobs: [
    { mechanic: 'mechanic-1', serviceBay: 'bay-1', reservedStartAt: new Date('2035-05-12T01:00:00Z'), reservedEndAt: new Date('2035-05-12T02:00:00Z') },
  ] }, period);
  assert.equal(state.mechanics.continuousResources, 1);
  assert.equal(state.serviceBays.available, false);
  assert.equal(state.available, false);
});

test('insufficient continuous availability rejects even when different Mechanics are free at different times', () => {
  const state = resources.assessAvailability({ mechanics: mechanics(2), serviceBays: bays(1), jobs: [
    { mechanic: 'mechanic-1', serviceBay: 'other-bay', reservedStartAt: new Date('2035-05-12T01:00:00Z'), reservedEndAt: new Date('2035-05-12T02:00:00Z') },
    { mechanic: 'mechanic-2', serviceBay: 'other-bay-2', reservedStartAt: new Date('2035-05-12T02:00:00Z'), reservedEndAt: new Date('2035-05-12T03:00:00Z') },
  ] }, resources.intervalFor('2035-05-12', '09:00', 120));
  assert.equal(state.mechanics.continuousResources, 0);
  assert.equal(state.available, false);
});

test('a requested service period that crosses into another work date is not schedulable', () => {
  assert.equal(resources.intervalFor('2035-05-12', '23:00', 120), null);
});
