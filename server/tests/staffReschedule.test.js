const { test, before, after } = require('node:test');
const holds = require('../services/bookingHoldService');
const originalReleaseExpired = holds.releaseExpired;
before(() => { holds.releaseExpired = async () => {}; });
after(() => { holds.releaseExpired = originalReleaseExpired; });
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Schedule = require('../models/Schedule');
const resources = require('../services/resourceAvailabilityService');
const bookings = require('../services/bookingService');
const engagement = require('../services/engagementService');

test('Staff rescheduling moves one reservation and keeps booking identity', async t => {
  t.mock.method(engagement, 'recordBookingEvent', async (_session, _booking, event) => {
    assert.equal(event, 'rescheduled');
  });
  const bookingId = String(new mongoose.Types.ObjectId());
  const previousId = new mongoose.Types.ObjectId();
  const nextId = new mongoose.Types.ObjectId();
  const staffId = new mongoose.Types.ObjectId();
  const session = {};
  let reserved = 0; let released = 0; let saved;
  t.mock.method(mongoose.connection, 'transaction', callback => callback(session));
  t.mock.method(Booking, 'findOne', filter => filter.status
    ? { session: value => { assert.equal(value, session); return { lean: async () => ({ _id: bookingId, schedule: previousId, status: 'confirmed', estimatedDurationMinutes: 60 }) }; } }
    : { populate: () => ({ lean: async () => ({ _id: bookingId, ...saved.$set }) }) });
  t.mock.method(Schedule, 'findById', value => {
    assert.equal(String(value), String(nextId));
    return { session: value => { assert.equal(value, session); return { lean: async () => ({ date: '2099-05-12', timeSlot: '09:00', isEnabled: true }) }; } };
  });
  t.mock.method(resources, 'canFitBooking', async (_period, options) => {
    assert.equal(options.session, session); assert.equal(options.excludeBookingId, bookingId);
    return { available: true };
  });
  t.mock.method(Schedule, 'findOneAndUpdate', async (filter, update, options) => {
    assert.equal(String(filter._id), String(nextId)); assert.equal(options.session, session);
    reserved += update.$inc.currentBookingCount; return {};
  });
  t.mock.method(Booking, 'updateOne', async (_filter, update, options) => {
    assert.equal(options.session, session); saved = update; return { matchedCount: 1 };
  });
  t.mock.method(Schedule, 'updateOne', async (filter, update, options) => {
    assert.equal(String(filter._id), String(previousId)); assert.equal(options.session, session);
    released += update.$inc.currentBookingCount; return { modifiedCount: 1 };
  });
  const result = await bookings.reschedule(bookingId, { schedule: String(nextId) }, staffId);
  assert.equal(result._id, bookingId);
  assert.equal(String(saved.$set.lastProcessedBy), String(staffId));
  assert.equal(saved.$set.bookingDate, '2099-05-12');
  assert.equal(reserved, 1); assert.equal(released, -1);
});
