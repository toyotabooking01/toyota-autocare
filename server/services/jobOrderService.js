const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const JobOrder = require('../models/JobOrder');
const User = require('../models/User');
const ServiceBay = require('../models/ServiceBay');
const HttpError = require('../utils/HttpError');
const engagement = require('./engagementService');

const activeJobs = ['pending', 'in_progress'];
const details = [
  { path: 'mechanic', select: 'fullName employeeId' },
  { path: 'serviceBay', select: 'name' },
  { path: 'booking', select: 'client vehicle services bookingDate bookingTime bookingType status concern', populate: [
    { path: 'client', select: 'fullName' },
    { path: 'vehicle', select: 'make model year plateNumber' },
    { path: 'services', select: 'name' },
  ] },
];

function id(value, label) {
  if (!mongoose.isObjectIdOrHexString(value)) throw new HttpError(400, `Invalid ${label} ID.`);
  return value;
}
function assignmentInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
    || Object.keys(raw).length !== 2 || !Object.keys(raw).every(key => ['mechanic', 'serviceBay'].includes(key))) {
    throw new HttpError(400, 'Select one Mechanic and one Service Bay.');
  }
  return { mechanic: id(raw.mechanic, 'mechanic'), serviceBay: id(raw.serviceBay, 'service bay') };
}
async function options() {
  const [mechanics, bays] = await Promise.all([
    User.find({ role: 'mechanic', status: 'active', isArchived: false, availability: 'available' })
      .select('_id fullName employeeId').sort({ fullName: 1 }).lean(),
    ServiceBay.find({ operationalStatus: 'operational', isArchived: false, availability: 'available' })
      .select('_id name').sort({ name: 1 }).lean(),
  ]);
  return { mechanics: mechanics.map(item => ({ _id: item._id, fullName: item.fullName, employeeId: item.employeeId })),
    serviceBays: bays.map(item => ({ _id: item._id, name: item.name })) };
}
async function assign(rawBookingId, raw) {
  const bookingId = id(rawBookingId, 'booking');
  const { mechanic, serviceBay } = assignmentInput(raw);
  let jobId;
  try {
    await mongoose.connection.transaction(async session => {
      const booking = await Booking.findOneAndUpdate({ _id: bookingId, status: 'checked_in',
        assignedMechanic: null, assignedServiceBay: null },
      { $set: { status: 'mechanic_assigned', assignedMechanic: mechanic, assignedServiceBay: serviceBay } },
      { returnDocument: 'after', session });
      if (!booking) throw new HttpError(409, 'Only unassigned checked-in bookings can be assigned.');

      // These checks also protect against a manually changed availability field on older records.
      const mechanicJob = await JobOrder.exists({ mechanic, status: { $in: activeJobs } }).session(session);
      const bayJob = await JobOrder.exists({ serviceBay, status: { $in: activeJobs } }).session(session);
      if (mechanicJob || bayJob) throw new HttpError(409, 'Mechanic or Service Bay has unfinished work.');

      const reservedMechanic = await User.findOneAndUpdate({ _id: mechanic, role: 'mechanic', status: 'active',
        isArchived: false, availability: 'available' }, { $set: { availability: 'busy' } }, { session });
      if (!reservedMechanic) throw new HttpError(409, 'Mechanic is no longer available.');
      const reservedBay = await ServiceBay.findOneAndUpdate({ _id: serviceBay, operationalStatus: 'operational',
        isArchived: false, availability: 'available' }, { $set: { availability: 'occupied' } }, { session });
      if (!reservedBay) throw new HttpError(409, 'Service Bay is no longer available.');

      const [job] = await JobOrder.create([{
        booking: bookingId, mechanic, serviceBay, customerConcern: booking.concern || '', status: 'pending',
      }], { session });
      jobId = job._id;
      await engagement.recordBookingEvent(session, booking, 'mechanic_assigned');
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error.code === 11000 || error.hasErrorLabel?.('TransientTransactionError')) {
      throw new HttpError(409, 'Assignment changed during submission. Refresh and try again.');
    }
    throw error;
  }
  return get(jobId);
}
async function list(mechanicId) {
  return JobOrder.find(mechanicId ? { mechanic: mechanicId } : {})
    .sort({ createdAt: -1 }).populate(details).lean();
}
async function get(rawId, mechanicId) {
  const filter = { _id: id(rawId, 'Job Order') };
  if (mechanicId) filter.mechanic = mechanicId;
  const job = await JobOrder.findOne(filter).populate(details).lean();
  if (!job) throw new HttpError(404, 'Job Order not found.');
  return job;
}
async function active(mechanicId) {
  const job = await JobOrder.findOne({ mechanic: mechanicId, status: { $in: activeJobs } })
    .sort({ createdAt: -1 }).populate(details).lean();
  return job || null;
}
function workInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Object.keys(raw).length
    || Object.keys(raw).some(key => !['mechanicNotes', 'serviceChecklist'].includes(key))) {
    throw new HttpError(400, 'Only service notes and checklist items can be updated.');
  }
  const data = {};
  if ('mechanicNotes' in raw) {
    if (typeof raw.mechanicNotes !== 'string' || raw.mechanicNotes.trim().length > 5000) {
      throw new HttpError(400, 'Service notes must be at most 5000 characters.');
    }
    data.mechanicNotes = raw.mechanicNotes.trim();
  }
  if ('serviceChecklist' in raw) {
    if (!Array.isArray(raw.serviceChecklist) || raw.serviceChecklist.length > 30
      || raw.serviceChecklist.some(item => !item || typeof item !== 'object' || Array.isArray(item)
        || Object.keys(item).some(key => !['description', 'isCompleted'].includes(key))
        || typeof item.description !== 'string' || !item.description.trim()
        || item.description.trim().length > 500 || typeof item.isCompleted !== 'boolean')) {
      throw new HttpError(400, 'Checklist needs up to 30 valid items.');
    }
    data.serviceChecklist = raw.serviceChecklist.map(item => ({ description: item.description.trim(), isCompleted: item.isCompleted }));
  }
  return data;
}
async function saveWork(rawId, mechanicId, raw) {
  const jobId = id(rawId, 'Job Order');
  const data = workInput(raw);
  await mongoose.connection.transaction(async session => {
    const job = await JobOrder.findOne({ _id: jobId, mechanic: mechanicId, status: 'in_progress' }).session(session).lean();
    if (!job) throw new HttpError(404, 'Active Job Order not found.');
    const booking = await Booking.findOneAndUpdate({ _id: job.booking, assignedMechanic: mechanicId, status: 'in_service' },
      { $inc: { __v: 1 } }, { session });
    if (!booking) throw new HttpError(409, 'Service notes can only be changed while work is in service.');
    const changed = await JobOrder.findOneAndUpdate({ _id: jobId, mechanic: mechanicId, status: 'in_progress' },
      { $set: data }, { session, runValidators: true });
    if (!changed) throw new HttpError(409, 'Job Order changed during submission.');
  });
  return get(jobId, mechanicId);
}
const actions = {
  start: { role: 'mechanic', from: 'mechanic_assigned', to: 'in_service', jobFrom: 'pending' },
  'final-inspection': { role: 'mechanic', from: 'in_service', to: 'final_inspection', jobFrom: 'in_progress' },
  'ready-for-release': { role: 'admin', from: 'final_inspection', to: 'ready_for_release', jobFrom: 'in_progress' },
  complete: { role: 'admin', from: 'ready_for_release', to: 'completed', jobFrom: 'in_progress' },
};
async function transition(rawId, actor, action) {
  const jobId = id(rawId, 'Job Order');
  const step = actions[action];
  if (!step) throw new HttpError(400, 'Invalid Job Order action.');
  if (actor.role !== step.role) throw new HttpError(403, 'Access denied.');
  await mongoose.connection.transaction(async session => {
    const filter = { _id: jobId, status: step.jobFrom };
    if (step.role === 'mechanic') filter.mechanic = actor._id;
    const job = await JobOrder.findOne(filter).session(session).lean();
    if (!job) throw new HttpError(step.role === 'mechanic' ? 404 : 409, 'Job Order is unavailable at this stage.');
    if (action === 'complete' && !job.startedAt) throw new HttpError(409, 'Service has not started.');
    const bookingFilter = { _id: job.booking, status: step.from,
      assignedMechanic: job.mechanic, assignedServiceBay: job.serviceBay };
    const changedBooking = await Booking.findOneAndUpdate(bookingFilter,
      { $set: { status: step.to } }, { returnDocument: 'after', session });
    if (!changedBooking) throw new HttpError(409, 'Booking is unavailable at this stage.');
    const completedAt = action === 'complete' ? new Date() : null;
    if (completedAt && completedAt < job.startedAt) throw new HttpError(409, 'Completion cannot precede service start.');
    const update = action === 'start'
      ? { $set: { status: 'in_progress', startedAt: new Date() } }
      : action === 'complete'
        ? { $set: { status: 'completed', completedAt } }
        : { $inc: { __v: 1 } };
    const changedJob = await JobOrder.findOneAndUpdate(filter, update, { session });
    if (!changedJob) throw new HttpError(409, 'Job Order changed during submission.');
    if (action === 'complete') {
      await User.updateOne({ _id: job.mechanic, role: 'mechanic', availability: 'busy' },
        { $set: { availability: 'available' } }, { session });
      await ServiceBay.updateOne({ _id: job.serviceBay, availability: 'occupied' },
        { $set: { availability: 'available' } }, { session });
      await engagement.updateReminders(session, changedBooking, completedAt);
    }
    await engagement.recordBookingEvent(session, changedBooking, step.to);
  });
  return get(jobId, step.role === 'mechanic' ? actor._id : undefined);
}
module.exports = { assignmentInput, options, assign, list, get, active, workInput, saveWork, transition };
