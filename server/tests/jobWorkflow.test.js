const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const JobOrder = require('../models/JobOrder');
const User = require('../models/User');
const ServiceBay = require('../models/ServiceBay');
const jobs = require('../services/jobOrderService');
const engagement = require('../services/engagementService');
const originalRecordEvent = engagement.recordBookingEvent;
const originalReminders = engagement.updateReminders;
before(() => { engagement.recordBookingEvent = async () => {}; engagement.updateReminders = async () => {}; });
after(() => { engagement.recordBookingEvent = originalRecordEvent; engagement.updateReminders = originalReminders; });

const id = () => String(new mongoose.Types.ObjectId());

test('service notes and checklist accept only bounded existing fields', () => {
  assert.deepEqual(jobs.workInput({ mechanicNotes: '  Checked fluids  ', serviceChecklist: [
    { description: '  Oil level ', isCompleted: true },
  ] }), { mechanicNotes: 'Checked fluids', serviceChecklist: [{ description: 'Oil level', isCompleted: true }] });
  for (const body of [{ status: 'completed' }, { mechanicNotes: 'a'.repeat(5001) },
    { serviceChecklist: [{ description: '', isCompleted: true }] },
    { serviceChecklist: [{ description: 'Oil', isCompleted: 'yes' }] }]) {
    assert.throws(() => jobs.workInput(body), { status: 400 });
  }
});

test('active JobOrder lookup is scoped to the signed-in Mechanic', async () => {
  const oldFind = JobOrder.findOne;
  let filter;
  JobOrder.findOne = query => { filter = query; return { sort: () => ({ populate: () => ({ lean: async () => null }) }) }; };
  const mechanic = id();
  try {
    assert.equal(await jobs.active(mechanic), null);
    assert.equal(filter.mechanic, mechanic);
    assert.deepEqual(filter.status, { $in: ['pending', 'in_progress'] });
  } finally { JobOrder.findOne = oldFind; }
});

test('Mechanic and Admin transitions keep Booking and JobOrder synchronized and release resources on completion', async () => {
  const original = { transaction: mongoose.connection.transaction, jobFind: JobOrder.findOne,
    jobUpdate: JobOrder.findOneAndUpdate, bookingUpdate: Booking.findOneAndUpdate,
    userUpdate: User.updateOne, bayUpdate: ServiceBay.updateOne };
  const mechanic = id(); const bay = id(); const jobId = id(); const bookingId = id();
  const state = { booking: 'mechanic_assigned', job: 'pending', startedAt: null, completedAt: null,
    mechanic: 'busy', bay: 'occupied', releases: 0 };
  mongoose.connection.transaction = async callback => callback({});
  JobOrder.findOne = filter => ({
    session: () => ({ lean: async () => filter.status === state.job && (!filter.mechanic || String(filter.mechanic) === mechanic)
      ? { _id: jobId, booking: bookingId, mechanic, serviceBay: bay, startedAt: state.startedAt } : null }),
    populate: () => ({ lean: async () => ({ _id: jobId, status: state.job, booking: { status: state.booking } }) }),
  });
  Booking.findOneAndUpdate = async (filter, update) => {
    assert.equal(String(filter.assignedMechanic), mechanic);
    assert.equal(String(filter.assignedServiceBay), bay);
    if (state.booking !== filter.status) return null;
    state.booking = update.$set.status; return {};
  };
  JobOrder.findOneAndUpdate = async (filter, update) => {
    if (state.job !== filter.status) return null;
    if (update.$set) {
      state.job = update.$set.status;
      if (update.$set.startedAt) state.startedAt = update.$set.startedAt;
      if (update.$set.completedAt) state.completedAt = update.$set.completedAt;
    }
    return {};
  };
  User.updateOne = async (filter, update) => { state.releases++; assert.equal(filter.availability, 'busy'); state.mechanic = update.$set.availability; return { modifiedCount: 1 }; };
  ServiceBay.updateOne = async (filter, update) => { state.releases++; assert.equal(filter.availability, 'occupied'); state.bay = update.$set.availability; return { modifiedCount: 1 }; };
  try {
    const own = { role: 'mechanic', _id: mechanic }; const admin = { role: 'admin', _id: id() };
    await assert.rejects(jobs.transition(jobId, { role: 'mechanic', _id: id() }, 'start'), { status: 404 });
    await assert.rejects(jobs.transition(jobId, admin, 'start'), { status: 403 });
    await jobs.transition(jobId, own, 'start');
    assert.equal(state.booking, 'in_service'); assert.equal(state.job, 'in_progress'); assert.ok(state.startedAt);
    await assert.rejects(jobs.transition(jobId, own, 'start'), { status: 404 });
    await jobs.transition(jobId, own, 'final-inspection');
    assert.equal(state.booking, 'final_inspection'); assert.equal(state.job, 'in_progress');
    await assert.rejects(jobs.transition(jobId, own, 'final-inspection'), { status: 409 });
    await assert.rejects(jobs.transition(jobId, own, 'ready-for-release'), { status: 403 });
    await jobs.transition(jobId, admin, 'ready-for-release');
    assert.equal(state.booking, 'ready_for_release'); assert.equal(state.job, 'in_progress');
    await assert.rejects(jobs.transition(jobId, admin, 'ready-for-release'), { status: 409 });
    await jobs.transition(jobId, admin, 'complete');
    assert.equal(state.booking, 'completed'); assert.equal(state.job, 'completed'); assert.ok(state.completedAt);
    assert.equal(state.mechanic, 'available'); assert.equal(state.bay, 'available'); assert.equal(state.releases, 2);
    await assert.rejects(jobs.transition(jobId, admin, 'complete'), { status: 409 });
  } finally {
    mongoose.connection.transaction = original.transaction; JobOrder.findOne = original.jobFind;
    JobOrder.findOneAndUpdate = original.jobUpdate; Booking.findOneAndUpdate = original.bookingUpdate;
    User.updateOne = original.userUpdate; ServiceBay.updateOne = original.bayUpdate;
  }
});

test('failed JobOrder progress update aborts Booking transition', async () => {
  const original = { transaction: mongoose.connection.transaction, jobFind: JobOrder.findOne,
    jobUpdate: JobOrder.findOneAndUpdate, bookingUpdate: Booking.findOneAndUpdate };
  const bookingId = id(); const mechanic = id(); const bay = id();
  let status = 'mechanic_assigned';
  mongoose.connection.transaction = async callback => {
    try { await callback({}); } catch (error) { status = 'mechanic_assigned'; throw error; }
  };
  JobOrder.findOne = () => ({ session: () => ({ lean: async () => ({ booking: bookingId, mechanic, serviceBay: bay }) }) });
  Booking.findOneAndUpdate = async (filter, update) => { assert.equal(filter.status, 'mechanic_assigned'); status = update.$set.status; return {}; };
  JobOrder.findOneAndUpdate = async () => { throw new Error('Deliberate JobOrder failure'); };
  try {
    await assert.rejects(jobs.transition(id(), { role: 'mechanic', _id: mechanic }, 'start'), /Deliberate JobOrder failure/);
    assert.equal(status, 'mechanic_assigned');
  } finally {
    mongoose.connection.transaction = original.transaction; JobOrder.findOne = original.jobFind;
    JobOrder.findOneAndUpdate = original.jobUpdate; Booking.findOneAndUpdate = original.bookingUpdate;
  }
});

test('service notes require the assigned Mechanic and an in-service Booking', async () => {
  const original = { transaction: mongoose.connection.transaction, jobFind: JobOrder.findOne,
    jobUpdate: JobOrder.findOneAndUpdate, bookingUpdate: Booking.findOneAndUpdate };
  const mechanic = id(); const jobId = id(); const bookingId = id();
  let changed = 0; let bookingStatus = 'in_service';
  mongoose.connection.transaction = async callback => callback({});
  JobOrder.findOne = filter => ({
    session: () => ({ lean: async () => String(filter.mechanic) === mechanic ? { booking: bookingId } : null }),
    populate: () => ({ lean: async () => ({ _id: jobId }) }),
  });
  Booking.findOneAndUpdate = async filter => bookingStatus === filter.status ? {} : null;
  JobOrder.findOneAndUpdate = async (filter, update) => { changed++; assert.equal(String(filter.mechanic), mechanic); assert.equal(update.$set.mechanicNotes, 'Checked fluids'); return {}; };
  try {
    await assert.rejects(jobs.saveWork(jobId, id(), { mechanicNotes: 'Checked fluids' }), { status: 404 });
    await jobs.saveWork(jobId, mechanic, { mechanicNotes: 'Checked fluids' });
    assert.equal(changed, 1);
    bookingStatus = 'final_inspection';
    await assert.rejects(jobs.saveWork(jobId, mechanic, { mechanicNotes: 'Checked fluids' }), { status: 409 });
    assert.equal(changed, 1);
  } finally {
    mongoose.connection.transaction = original.transaction; JobOrder.findOne = original.jobFind;
    JobOrder.findOneAndUpdate = original.jobUpdate; Booking.findOneAndUpdate = original.bookingUpdate;
  }
});
