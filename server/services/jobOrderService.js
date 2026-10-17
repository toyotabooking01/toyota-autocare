const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const JobOrder = require('../models/JobOrder');
const Service = require('../models/Service');
const User = require('../models/User');
const ServiceBay = require('../models/ServiceBay');
const Schedule = require('../models/Schedule');
const HttpError = require('../utils/HttpError');
const engagement = require('./engagementService');
const resourceAvailability = require('./resourceAvailabilityService');
const scheduleService = require('./scheduleService');
const { identity, audit } = require('../utils/operationalActor');
const bayOccupancy = require('./bayOccupancyService');
const paymentService = require('./paymentService');
const additionalWork = require('./additionalWorkService');
const finalBilling = require('./finalBillingService');
const invoices = require('./invoiceService');
const Invoice = require('../models/Invoice');
const Vehicle = require('../models/Vehicle');

const activeJobs = ['pending', 'in_progress'];
const monitoringStatuses = ['mechanic_assigned', 'in_service', 'final_inspection', 'ready_for_release', 'completed'];
const details = [
  { path: 'mechanic', select: 'fullName employeeId' },
  { path: 'serviceBay', select: 'name' },
  { path: 'activity.performedBy', select: 'fullName role' },
  { path: 'booking', select: 'client vehicle services bookingDate bookingTime bookingType status concern estimatedDurationMinutes initialEstimatedDurationMinutes actualDurationMinutes reservedStartAt reservedEndAt releasedAt releasedByRole lastProcessedBy', populate: [
    { path: 'client', select: 'fullName' },
    { path: 'vehicle', select: 'make model year plateNumber' },
    { path: 'services', select: 'name estimatedDuration isOtherService' },
    { path: 'lastProcessedBy', select: 'fullName role' },
  ] },
];

function id(value, label) {
  if (!mongoose.isObjectIdOrHexString(value)) throw new HttpError(400, `Invalid ${label} ID.`);
  return value;
}
function assignmentInput(raw) {
  require('../utils/validateForm')('assignment', raw);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
    || Object.keys(raw).length !== 2 || !Object.keys(raw).every(key => ['mechanic', 'serviceBay'].includes(key))) {
    throw new HttpError(400, 'Select one Mechanic and one Service Bay.');
  }
  return { mechanic: id(raw.mechanic, 'mechanic'), serviceBay: id(raw.serviceBay, 'service bay') };
}
async function options() {
    const [mechanics, bays] = await Promise.all([
      User.find({ role: 'mechanic', status: 'active', isArchived: false, availability: 'available' })
        .select('_id fullName employeeId availability').sort({ fullName: 1 }).lean(),
    ServiceBay.find({ operationalStatus: 'operational', isArchived: false })
      .select('_id name operationalStatus availability').sort({ name: 1 }).lean(),
  ]);
    // Job and booking state is authoritative; a stored occupied flag may be stale after finished work.
    const availableBays = (await bayOccupancy.describe(bays)).filter(bay => bay.availability === 'available');
    return { mechanics: mechanics.map(item => ({ _id: item._id, fullName: item.fullName, employeeId: item.employeeId, availability: item.availability })),
    serviceBays: availableBays.map(item => ({ _id: item._id, name: item.name, availability: item.availability })) };
}
async function assign(rawBookingId, raw, staffId) {
  const operator = identity(staffId);
  const bookingId = id(rawBookingId, 'booking');
  const { mechanic, serviceBay } = assignmentInput(raw);
  let jobId;
  try {
    await mongoose.connection.transaction(async session => {
      const booking = await Booking.findOneAndUpdate({ _id: bookingId, status: 'checked_in',
        assignedMechanic: null, assignedServiceBay: null },
      { $set: { status: 'mechanic_assigned', assignedMechanic: mechanic, assignedServiceBay: serviceBay,
        lastProcessedBy: operator.id, lastProcessedByRole: operator.role, lastProcessedAt: new Date() },
        $push: { activity: audit(staffId, 'assign') } },
      { returnDocument: 'after', session });
      if (!booking) throw new HttpError(409, 'Only unassigned checked-in bookings can be assigned.');

      // These checks also protect against a manually changed availability field on older records.
      const mechanicJob = await JobOrder.exists({ mechanic, status: { $in: activeJobs } }).session(session);
      const bayJob = await JobOrder.exists({ serviceBay, status: { $in: activeJobs } }).session(session);
      if (mechanicJob || bayJob) throw new HttpError(409, 'Mechanic or Service Bay has unfinished work.', { ...(mechanicJob ? { mechanic: 'Mechanic has unfinished work.' } : {}), ...(bayJob ? { serviceBay: 'Service bay has unfinished work.' } : {}) });
      // Exclude the booking just claimed above; it has already entered mechanic_assigned in this transaction.
      const activeBayBookings = await Booking.exists({ _id: { $ne: bookingId }, assignedServiceBay: serviceBay,
        status: { $in: ['mechanic_assigned', 'in_service', 'final_inspection', 'ready_for_release'] } }).session(session);
      if (activeBayBookings) throw new HttpError(409, 'Service Bay has an active booking.', { serviceBay: 'Service Bay is occupied.' });

      const reservedMechanic = await User.findOneAndUpdate({ _id: mechanic, role: 'mechanic', status: 'active',
        isArchived: false, availability: 'available' }, { $set: { availability: 'busy' } }, { session });
      if (!reservedMechanic) throw new HttpError(409, 'Mechanic is no longer available.', { mechanic: 'Mechanic is no longer available.' });
      const reservedBay = await ServiceBay.findOneAndUpdate({ _id: serviceBay, operationalStatus: 'operational',
        isArchived: false, availability: { $in: ['available', 'occupied'] } }, { $set: { availability: 'occupied' } }, { session });
      if (!reservedBay) throw new HttpError(409, 'Service Bay is no longer available.', { serviceBay: 'Service Bay is no longer available.' });

      const selectedServices = await Service.find({ _id: { $in: booking.services || [] } })
        .select('_id name checklistTemplate').session(session).lean();
      const serviceById = new Map(selectedServices.map(service => [String(service._id), service]));
      const serviceChecklist = (booking.services || []).flatMap(serviceId => {
        const service = serviceById.get(String(serviceId));
        return (service?.checklistTemplate || []).map(description => ({ serviceId, serviceName: service.name,
          description, isCompleted: false }));
      });

      const [job] = await JobOrder.create([{
        booking: bookingId, mechanic, serviceBay, customerConcern: booking.concern || '', status: 'pending',
        reservedStartAt: booking.reservedStartAt, reservedEndAt: booking.reservedEndAt,
        estimatedDurationMinutes: booking.estimatedDurationMinutes,
        serviceChecklist, checklistRequired: serviceChecklist.length > 0,
        activity: [audit(staffId, 'assigned')],
      }], { session });
      jobId = job._id;
      await engagement.recordBookingEvent(session, booking, 'mechanic_assigned', { jobOrderId: job._id });
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
async function list(mechanicId, query = {}) {
  const filter = mechanicId ? { mechanic: mechanicId } : {};
  if (!mechanicId) {
    if (query.status && query.status !== 'all') {
      if (!monitoringStatuses.includes(query.status)) throw new HttpError(400, 'Invalid Job Order status filter.');
      const bookings = await Booking.find({ status: query.status }).select('_id').lean();
      filter.booking = { $in: bookings.map(item => item._id) };
    }
    if (query.mechanic && query.mechanic !== 'all') {
      if (!mongoose.isObjectIdOrHexString(query.mechanic)) throw new HttpError(400, 'Invalid mechanic filter.');
      filter.mechanic = query.mechanic;
    }
    if (query.search !== undefined) {
      if (typeof query.search !== 'string' || query.search.trim().length > 100) throw new HttpError(400, 'Search must be at most 100 characters.');
      const term = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (term) {
      const regex = new RegExp(term, 'i');
      const [vehicles, clients, mechanics, services] = await Promise.all([
        Vehicle.find({ $or: [{ make: regex }, { model: regex }, { plateNumber: regex }, ...(Number.isInteger(Number(term)) ? [{ year: Number(term) }] : [])] }).select('_id').lean(),
        User.find({ role: 'client', fullName: regex }).select('_id').lean(),
        User.find({ role: 'mechanic', fullName: regex }).select('_id').lean(),
        Service.find({ name: regex }).select('_id').lean(),
      ]);
      const bookingCriteria = [];
      if (vehicles.length) bookingCriteria.push({ vehicle: { $in: vehicles.map(item => item._id) } });
      if (clients.length) bookingCriteria.push({ client: { $in: clients.map(item => item._id) } });
      if (services.length) bookingCriteria.push({ services: { $in: services.map(item => item._id) } });
      bookingCriteria.push({ 'estimatedServiceItems.name': regex });
      if (/^[a-f\d]{24}$/i.test(term)) bookingCriteria.push({ _id: term });
      const bookings = await Booking.find({ $or: bookingCriteria }).select('_id').lean();
      const searchOr = [{ booking: { $in: bookings.map(item => item._id) } }];
      if (mechanics.length) searchOr.push({ mechanic: { $in: mechanics.map(item => item._id) } });
      if (/^[a-f\d]{24}$/i.test(term)) searchOr.push({ _id: term });
      filter.$and = [...(filter.$and || []), { $or: searchOr }];
      }
    }
  }
  return require('../utils/pagination').listPage(JobOrder, filter, mechanicId ? {} : query,
    () => JobOrder.find(filter).sort({ createdAt: -1, _id: -1 }).populate(details));
}
async function get(rawId, mechanicId) {
  const filter = { _id: id(rawId, 'Job Order') };
  if (mechanicId) filter.mechanic = mechanicId;
  const job = await JobOrder.findOne(filter).populate(details).lean();
  if (!job) throw new HttpError(404, 'Job Order not found.');
  return job;
}
async function active(mechanicId) {
  const job = await JobOrder.findOne({ ...(mechanicId ? { mechanic: mechanicId } : {}), status: { $in: activeJobs } })
    .sort({ createdAt: -1 }).populate(details).lean();
  return job || null;
}
function workInput(raw) {
  require('../utils/validateForm')('work', raw, { partial: true });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Object.keys(raw).length
    || Object.keys(raw).some(key => !['mechanicNotes', 'serviceChecklist'].includes(key))) {
    throw new HttpError(400, 'Only service notes and checklist items can be updated.');
  }
  const data = {};
  if ('mechanicNotes' in raw) {
    if (typeof raw.mechanicNotes !== 'string' || raw.mechanicNotes.trim().length > 5000) {
      throw new HttpError(400, 'Service notes must be at most 5000 characters.', { mechanicNotes: 'Service notes must be at most 5000 characters.' });
    }
    data.mechanicNotes = raw.mechanicNotes.trim();
  }
  if ('serviceChecklist' in raw) {
    if (!Array.isArray(raw.serviceChecklist) || raw.serviceChecklist.length > 30
      || raw.serviceChecklist.some(item => !item || typeof item !== 'object' || Array.isArray(item)
        || Object.keys(item).some(key => !['description', 'isCompleted'].includes(key))
        || typeof item.description !== 'string' || !item.description.trim()
        || item.description.trim().length > 500 || typeof item.isCompleted !== 'boolean')) {
      throw new HttpError(400, 'Checklist needs up to 30 valid items.', { serviceChecklist: 'Checklist needs up to 30 valid items.' });
    }
    data.serviceChecklist = raw.serviceChecklist.map(item => ({ description: item.description.trim(), isCompleted: item.isCompleted }));
  }
  return data;
}

function durationInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== 1
    || !Object.hasOwn(raw, 'estimatedDurationMinutes') || !Number.isSafeInteger(raw.estimatedDurationMinutes)
    || raw.estimatedDurationMinutes < 1 || raw.estimatedDurationMinutes > 10080) {
    throw new HttpError(400, 'Enter an estimated duration from 1 to 10,080 minutes.', { estimatedDurationMinutes: 'Enter a positive whole number of minutes.' });
  }
  return raw.estimatedDurationMinutes;
}

async function updateEstimatedDuration(rawId, actor, raw) {
  const jobId = id(rawId, 'Job Order');
  const nextDuration = durationInput(raw);
  let changed = false;
  await mongoose.connection.transaction(async session => {
    const jobFilter = { _id: jobId, status: { $in: activeJobs } };
    if (actor.role === 'mechanic') jobFilter.mechanic = actor._id;
    const job = await JobOrder.findOne(jobFilter).session(session).lean();
    if (!job) throw new HttpError(actor.role === 'mechanic' ? 404 : 409, 'Active Job Order not found.');
    const booking = await Booking.findOne({ _id: job.booking,
      status: { $in: ['mechanic_assigned', 'in_service', 'final_inspection', 'ready_for_release'] },
      assignedMechanic: job.mechanic, assignedServiceBay: job.serviceBay }).session(session).lean();
    if (!booking) throw new HttpError(409, 'Booking is not open for an estimate update.');
    const currentDuration = job.estimatedDurationMinutes || booking.estimatedDurationMinutes
      || (job.reservedStartAt && job.reservedEndAt ? Math.round((job.reservedEndAt - job.reservedStartAt) / 60_000) : null);
    if (!currentDuration || currentDuration === nextDuration) return;
    const startAt = job.reservedStartAt || booking.reservedStartAt || new Date(`${booking.bookingDate}T${booking.bookingTime}:00+08:00`);
    const reservedEndAt = job.reservedEndAt || booking.reservedEndAt || new Date(startAt.getTime() + currentDuration * 60_000);
    const proposedEndAt = new Date(startAt.getTime() + nextDuration * 60_000);
    const extendsReservation = proposedEndAt > reservedEndAt;
    const nextReservedEndAt = extendsReservation ? proposedEndAt : reservedEndAt;
    if (extendsReservation) {
      const period = { startAt, endAt: proposedEndAt };
      const schedule = booking.schedule ? await Schedule.findById(booking.schedule).session(session).lean() : null;
      if (schedule && !scheduleService.withinWorkingHours(schedule, period)) {
        throw new HttpError(409, 'The new estimate would extend beyond closing time.', { estimatedDurationMinutes: 'Choose a shorter estimate that fits before closing.' });
      }
      const fit = await resourceAvailability.canFitAssignedResources(period, { session, excludeBookingId: booking._id,
        mechanicId: job.mechanic, serviceBayId: job.serviceBay });
      if (!fit.available) throw new HttpError(409, 'The assigned Mechanic or Service Bay is reserved during that extension.',
        { estimatedDurationMinutes: 'The assigned resources are unavailable for that extension. Choose a shorter estimate.' });
    }
    const history = { previousDurationMinutes: currentDuration, newDurationMinutes: nextDuration,
      changedAt: new Date(), changedBy: actor._id, changedByRole: actor.role };
    const bookingUpdate = await Booking.updateOne({ _id: booking._id, status: booking.status }, {
      $set: { estimatedDurationMinutes: nextDuration, reservedEndAt: nextReservedEndAt,
        reservedStartAt: startAt, initialEstimatedDurationMinutes: booking.initialEstimatedDurationMinutes || currentDuration },
      $push: { durationHistory: history, activity: audit(actor, 'update_estimate') }, $inc: { __v: 1 },
    }, { session });
    if (bookingUpdate.matchedCount !== 1) throw new HttpError(409, 'Booking changed during the estimate update. Refresh and try again.');
    const jobUpdate = await JobOrder.updateOne({ _id: job._id, status: job.status, mechanic: job.mechanic }, {
      $set: { estimatedDurationMinutes: nextDuration, reservedStartAt: startAt, reservedEndAt: nextReservedEndAt },
      $push: { activity: audit(actor, 'update_estimate') }, $inc: { __v: 1 },
    }, { session });
    if (jobUpdate.matchedCount !== 1) throw new HttpError(409, 'Job Order changed during the estimate update. Refresh and try again.');
    changed = true;
  });
  return { item: await get(jobId, actor.role === 'mechanic' ? actor._id : undefined), changed };
}
async function saveWork(rawId, actor, raw) {
  const jobId = id(rawId, 'Job Order');
  const data = workInput(raw);
  await mongoose.connection.transaction(async session => {
    const filter = { _id: jobId, status: 'in_progress' };
    if (actor.role === 'mechanic') filter.mechanic = actor._id;
    const job = await JobOrder.findOne(filter).session(session).lean();
    if (!job) throw new HttpError(404, 'Active Job Order not found.');
    if (data.serviceChecklist) {
      const snapshot = job.serviceChecklist || [];
      if (data.serviceChecklist.length !== snapshot.length || data.serviceChecklist.some((item, index) => item.description !== snapshot[index]?.description)) {
        throw new HttpError(400, 'Service checklist items cannot be changed.');
      }
      data.serviceChecklist = snapshot.map((item, index) => ({ ...item, isCompleted: data.serviceChecklist[index].isCompleted }));
    }
    const booking = await Booking.findOneAndUpdate({ _id: job.booking, assignedMechanic: job.mechanic, status: 'in_service' },
      { $inc: { __v: 1 } }, { session });
    if (!booking) throw new HttpError(409, 'Service notes can only be changed while work is in service.');
    const changed = await JobOrder.findOneAndUpdate(filter,
      { $set: data, $push: { activity: audit(actor, 'update_work') } }, { session, runValidators: true });
    if (!changed) throw new HttpError(409, 'Job Order changed during submission.');
  });
  return get(jobId, actor.role === 'mechanic' ? actor._id : undefined);
}
const actions = {
  start: { role: 'mechanic', from: 'mechanic_assigned', to: 'in_service', jobFrom: 'pending' },
  'final-inspection': { role: 'mechanic', from: 'in_service', to: 'final_inspection', jobFrom: 'in_progress' },
  'ready-for-release': { role: 'staff', from: 'final_inspection', to: 'ready_for_release', jobFrom: 'in_progress' },
  complete: { role: 'staff', from: 'ready_for_release', to: 'completed', jobFrom: 'in_progress' },
};
async function transition(rawId, actor, action) {
  const jobId = id(rawId, 'Job Order');
  const step = actions[action];
  if (!step) throw new HttpError(400, 'Invalid Job Order action.');
  if (actor.role !== step.role && actor.role !== 'admin') throw new HttpError(403, 'Access denied.');
  let invoiceId;
  await mongoose.connection.transaction(async session => {
    const filter = { _id: jobId, status: step.jobFrom };
    if (actor.role === 'mechanic') filter.mechanic = actor._id;
    const job = await JobOrder.findOne(filter).session(session).lean();
    if (!job) throw new HttpError(actor.role === 'mechanic' ? 404 : 409, 'Job Order is unavailable at this stage.');
    if (action === 'ready-for-release') {
      const previous = await Booking.findById(job.booking).select('status finalBillingLockedAt finalTotalCents').session(session).lean();
      if (previous?.status === 'ready_for_release' && previous.finalBillingLockedAt && previous.finalTotalCents != null) {
        const issued = await Invoice.findOne({ booking: job.booking, type: 'final_service' }).session(session).lean();
        if (!issued || issued.financialSnapshot?.finalServiceTotalCents !== previous.finalTotalCents)
          throw new HttpError(409, 'Final invoice is unavailable for this locked booking.');
        invoiceId = issued._id;
        return;
      }
    }
    if (action === 'final-inspection' && job.checklistRequired === true && (job.serviceChecklist || []).some(item => !item.isCompleted)) {
      throw new HttpError(409, 'Complete all service checklist items before final inspection.');
    }
    if (action === 'final-inspection' && await additionalWork.hasUnresolved(job.booking, session)) {
      throw new HttpError(409, 'Resolve all additional work requests before starting final inspection.');
    }
    if (action === 'complete' && !job.startedAt) throw new HttpError(409, 'Service has not started.');
    let billing, invoicePayment;
    if (action === 'ready-for-release' || action === 'complete') {
      const bookingQuery = Booking.findById(job.booking).select('client vehicle services status finalTotalCents estimatedTotalCents estimatedServiceItems finalBillingLockedAt');
      const currentBooking = await bookingQuery.session(session).lean();
      if (!currentBooking || currentBooking.status !== step.from) throw new HttpError(409, 'Booking is unavailable at this stage.');
      if (action === 'ready-for-release') {
        if (await Invoice.exists({ booking: job.booking, type: 'final_service' }).session(session))
          throw new HttpError(409, 'Final invoice already exists for this booking.');
        if (await additionalWork.hasUnresolved(job.booking, session))
          throw new HttpError(409, 'Resolve all additional work requests before final billing.');
        billing = await finalBilling.calculate(currentBooking, session);
        invoicePayment = await paymentService.calculate({ ...currentBooking, finalTotalCents: billing.finalTotalCents }, session);
        if (invoicePayment.payments.some(item => item.stage === 'downpayment' && item.status === 'submitted'))
          throw new HttpError(409, 'Verify or reject the submitted downpayment before marking ready for release.');
      }
      else {
        if (currentBooking.finalTotalCents == null)
          throw new HttpError(409, 'Final service total is unavailable for release.');
        const payment = await paymentService.calculate(currentBooking, session);
        const reason = paymentService.releaseReason(payment);
        if (reason) throw new HttpError(409, reason);
      }
    }
    const completedAt = action === 'complete' ? new Date() : null;
    if (completedAt && completedAt < job.startedAt) throw new HttpError(409, 'Completion cannot precede service start.');
    const actualDurationMinutes = completedAt ? Math.max(1, Math.ceil((completedAt - job.startedAt) / 60_000)) : null;
    const bookingFilter = { _id: job.booking, status: step.from,
      assignedMechanic: job.mechanic, assignedServiceBay: job.serviceBay };
    const processing = { lastProcessedBy: actor._id, lastProcessedByRole: actor.role, lastProcessedAt: new Date() };
    const bookingUpdate = action === 'complete'
      ? { $set: { status: step.to, reservedEndAt: completedAt, actualDurationMinutes,
        releasedAt: completedAt, releasedBy: actor._id, releasedByRole: actor.role, ...processing },
        $push: { activity: audit(actor, action) }, $inc: { __v: 1 } }
      : { $set: { status: step.to, ...(action === 'ready-for-release' ? {
        finalTotalCents: billing.finalTotalCents,
        originalServicesTotalCents: billing.originalServicesTotalCents,
        additionalWorkTotalCents: billing.additionalWorkTotalCents,
        finalBillingLockedAt: new Date(),
      } : {}),
        ...processing }, $push: { activity: audit(actor, action) } };
    const changedBooking = await Booking.findOneAndUpdate(bookingFilter,
      bookingUpdate, { returnDocument: 'after', session });
    if (!changedBooking) throw new HttpError(409, 'Booking is unavailable at this stage.');
    if (action === 'ready-for-release') invoiceId = await invoices.createForRelease(session, changedBooking,
      billing, invoicePayment, changedBooking.finalBillingLockedAt);
    const update = action === 'start'
      ? { $set: { status: 'in_progress', startedAt: new Date() }, $push: { activity: audit(actor, action) } }
      : action === 'complete'
        ? { $set: { status: 'completed', completedAt, reservedEndAt: completedAt, actualDurationMinutes },
          $push: { activity: audit(actor, action) } }
        : { $inc: { __v: 1 }, $push: { activity: audit(actor, action) } };
    const changedJob = await JobOrder.findOneAndUpdate(filter, update, { session });
    if (!changedJob) throw new HttpError(409, 'Job Order changed during submission.');
    if (action === 'complete') {
      await User.updateOne({ _id: job.mechanic, role: 'mechanic', availability: 'busy' },
        { $set: { availability: 'available' } }, { session });
      await ServiceBay.updateOne({ _id: job.serviceBay, availability: 'occupied' },
        { $set: { availability: 'available' } }, { session });
      await engagement.updateReminders(session, changedBooking, completedAt);
    }
    await engagement.recordBookingEvent(session, changedBooking, step.to, { jobOrderId: jobId });
  });
  if (invoiceId) await invoices.processAfterRelease(invoiceId);
  return get(jobId, actor.role === 'mechanic' ? actor._id : undefined);
}
module.exports = { assignmentInput, options, assign, list, get, active, workInput, saveWork, durationInput, updateEstimatedDuration, transition };
