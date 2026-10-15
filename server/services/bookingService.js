const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Schedule = require('../models/Schedule');
const Service = require('../models/Service');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const HttpError = require('../utils/HttpError');
const { duplicatePlateFilter, duplicatePlateError } = require('../utils/plateNumbers');
const scheduleService = require('./scheduleService');
const engagement = require('./engagementService');
const resourceAvailability = require('./resourceAvailabilityService');
const { identity, audit } = require('../utils/operationalActor');

const releaseable = ['pending', 'confirmed'];
const activeServiceStatuses = ['pending', 'confirmed', 'checked_in', 'mechanic_assigned', 'in_service', 'final_inspection', 'ready_for_release'];
const allStatuses = ['pending', 'confirmed', 'checked_in', 'mechanic_assigned', 'in_service',
  'final_inspection', 'ready_for_release', 'completed', 'cancelled', 'rejected', 'no_show'];
const populate = [
  { path: 'client', select: 'fullName email contactEmail phone isWalkInCustomer' },
  { path: 'vehicle', select: 'make model year plateNumber isArchived' },
  { path: 'services', select: 'name estimatedDuration estimatedPrice isOtherService isActive isArchived' },
  { path: 'schedule', select: 'date timeSlot isEnabled maximumCapacity currentBookingCount' },
  { path: 'assignedMechanic', select: 'fullName' },
  { path: 'assignedServiceBay', select: 'name' },
  { path: 'createdByStaff', select: 'fullName staffId role' },
  { path: 'lastProcessedBy', select: 'fullName role' },
  { path: 'activity.performedBy', select: 'fullName role' },
];
function publicBooking(booking) {
  if (!booking?.client?.isWalkInCustomer) return booking;
  const { contactEmail, ...client } = booking.client;
  return { ...booking, client: { ...client, email: contactEmail || '' } };
}

function id(raw, label) {
  if (!mongoose.isObjectIdOrHexString(raw)) throw new HttpError(400, `Invalid ${label} ID.`);
  return raw;
}
function input(raw) {
  require('../utils/validateForm')('booking', raw);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !['vehicle', 'services', 'schedule', 'concern'].includes(key))) {
    throw new HttpError(400, 'Invalid or unsupported booking fields.');
  }
  const vehicle = id(raw.vehicle, 'vehicle');
  const schedule = id(raw.schedule, 'schedule');
  if (!Array.isArray(raw.services) || raw.services.length < 1 || raw.services.length > 20) throw new HttpError(400, 'Select one or more services.');
  const services = raw.services.map(value => id(value, 'service'));
  if (new Set(services.map(String)).size !== services.length) throw new HttpError(400, 'A service cannot be selected twice.');
  if (raw.concern !== undefined && (typeof raw.concern !== 'string' || raw.concern.trim().length > 3000)) throw new HttpError(400, 'Concern must be text of at most 3000 characters.');
  return { vehicle, schedule, services, concern: raw.concern?.trim() || '' };
}
async function options() {
  return Service.find({ isActive: true, isArchived: false })
    .select('name description estimatedDuration estimatedPrice isOtherService').sort({ name: 1 }).lean();
}
async function walkInClients(rawSearch) {
  if (typeof rawSearch !== 'string' || rawSearch.trim().length < 2 || rawSearch.length > 100) {
    throw new HttpError(400, 'Enter at least two characters to search clients.');
  }
  const search = { $regex: rawSearch.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  const clients = await User.find({ role: 'client', status: 'active', isArchived: false, isWalkInCustomer: false,
    $or: [{ firstName: search }, { lastName: search }, { fullName: search }, { email: search }, { contactEmail: search }, { phone: search }] })
    .select('_id fullName email contactEmail phone isWalkInCustomer').sort({ fullName: 1 }).limit(20).lean();
  const ids = clients.map(client => client._id);
  const counts = ids.length ? await Vehicle.aggregate([{ $match: { owner: { $in: ids }, isArchived: false } },
    { $group: { _id: '$owner', count: { $sum: 1 } } }]) : [];
  const countById = new Map(counts.map(item => [String(item._id), item.count]));
  return clients.map(client => ({ _id: client._id, fullName: client.fullName,
    email: client.isWalkInCustomer ? client.contactEmail || '' : client.email,
    phone: client.phone || '', isWalkInCustomer: Boolean(client.isWalkInCustomer),
    vehicleCount: countById.get(String(client._id)) || 0 }));
}
async function walkInVehicles(rawClientId) {
  const clientId = id(rawClientId, 'client');
  if (!await User.exists({ _id: clientId, role: 'client', status: 'active', isArchived: false, isWalkInCustomer: false })) {
    throw new HttpError(404, 'Eligible client not found.');
  }
  const vehicles = await Vehicle.find({ owner: clientId, isArchived: false })
    .select('_id make model year plateNumber').sort({ createdAt: -1 }).lean();
  return vehicles.map(vehicle => ({ _id: vehicle._id, make: vehicle.make, model: vehicle.model,
    year: vehicle.year, plateNumber: vehicle.plateNumber }));
}
async function addWalkInVehicle(rawClientId, raw) {
  const clientId = id(rawClientId, 'client');
  if (!await User.exists({ _id: clientId, role: 'client', status: 'active', isArchived: false, isWalkInCustomer: false })) {
    throw new HttpError(404, 'Eligible customer not found.');
  }
  const vehicle = require('./peopleVehiclesService').vehicleInput(raw, true);
  const entry = await require('./toyotaCatalogService').validateSelection(vehicle);
  if (await Vehicle.exists(duplicatePlateFilter(vehicle.plateNumber))) throw duplicatePlateError();
  try { return await Vehicle.create({ ...vehicle, owner: clientId, catalogEntry: entry._id }); }
  catch (error) {
    if (error.code === 11000) throw duplicatePlateError();
    throw error;
  }
}
async function activeServiceIds(rawVehicleId, clientId) {
  const vehicleId = id(rawVehicleId, 'vehicle');
  if (!await Vehicle.exists({ _id: vehicleId, owner: clientId, isArchived: false })) throw new HttpError(404, 'Vehicle not found.');
  const active = await Booking.find({ vehicle: vehicleId, client: clientId, status: { $in: activeServiceStatuses } })
    .select('services').lean();
  return [...new Set(active.flatMap(booking => booking.services || []).map(String))];
}
async function createFor(clientId, raw, bookingType, staffId) {
  const data = input(raw);
  const createdId = await mongoose.connection.transaction(session => reserveBooking(session, clientId, data, bookingType, staffId));
  return get(createdId, bookingType === 'online' ? clientId : undefined);
}
async function reserveBooking(session, clientId, data, bookingType, staffId) {
    const creator = bookingType === 'walk-in' ? identity(staffId) : { id: clientId, role: 'client' };
    if (bookingType === 'walk-in') {
      const client = await User.exists({ _id: clientId, role: 'client', status: 'active', isArchived: false, isWalkInCustomer: false }).session(session);
      if (!client) throw new HttpError(400, 'Select an active client account.', { client: 'Select an active client account.' });
    }
    const vehicle = await Vehicle.exists({ _id: data.vehicle, owner: clientId, isArchived: false }).session(session);
    if (!vehicle) throw new HttpError(400, 'Select one of your current vehicles.', { vehicle: 'Select one of your current vehicles.' });
    // Serialize bookings per vehicle so concurrent requests cannot both pass this check.
    const vehicleGuard = await Vehicle.updateOne({ _id: data.vehicle, owner: clientId, isArchived: false },
      { $inc: { bookingLockVersion: 1 } }, { session });
    if (vehicleGuard.matchedCount !== 1) throw new HttpError(400, 'Select one of your current vehicles.', { vehicle: 'Select one of your current vehicles.' });
    const selectedServices = await Service.find({ _id: { $in: data.services }, isActive: true, isArchived: false })
      .select('_id estimatedDuration isOtherService').session(session).lean();
    if (selectedServices.length !== data.services.length) throw new HttpError(400, 'One or more services are unavailable.', { services: 'One or more services are unavailable.' });
    const activeBookings = await Booking.find({ vehicle: data.vehicle, status: { $in: activeServiceStatuses }, services: { $in: data.services } })
      .select('services').session(session).lean();
    const activeServiceSet = new Set(activeBookings.flatMap(booking => booking.services || []).map(String));
    const duplicateServiceIds = data.services.filter(serviceId => activeServiceSet.has(String(serviceId)));
    if (duplicateServiceIds.length) {
      throw new HttpError(409, 'This vehicle already has an active booking for one or more selected services.', {
        services: 'This vehicle already has an active booking for one or more selected services.', duplicateServiceIds,
      });
    }
    if (selectedServices.some(service => service.isOtherService) && !data.concern.trim()) {
      throw new HttpError(400, 'Describe the issue or service needed.', { concern: 'Describe the issue or service needed.' });
    }
    let estimatedDurationMinutes;
    try { estimatedDurationMinutes = resourceAvailability.calculateTotalDuration(selectedServices); }
    catch { throw new HttpError(409, 'The selected services do not have valid durations.', { services: 'Please choose services with valid durations.' }); }
    const slot = await Schedule.findById(data.schedule).session(session).lean();
    if (!slot || !slot.isEnabled || !scheduleService.isFuture(slot)) throw new HttpError(409, 'Selected schedule is unavailable. Please choose another time.', { schedule: 'Selected schedule is unavailable. Please choose another time.' });
    const period = resourceAvailability.intervalFor(slot.date, slot.timeSlot, estimatedDurationMinutes);
    if (!period) throw new HttpError(409, 'Selected services do not fit within the scheduled work day.', { schedule: 'Choose an earlier start time for the selected services.' });
    if (!scheduleService.withinWorkingHours(slot, period)) throw new HttpError(409, 'Selected services do not fit within working hours.', { schedule: 'Choose a time that ends before closing.' });
    const resourceFit = await resourceAvailability.canFitBooking(period, { session });
    if (!resourceFit.available) throw new HttpError(409, 'No Mechanic and Service Bay are available for the full service duration.', { schedule: 'Choose another time with enough continuous availability.' });
    const reserved = await Schedule.findOneAndUpdate({
      _id: data.schedule, isEnabled: true, date: slot.date, timeSlot: slot.timeSlot,
      $expr: { $lt: ['$currentBookingCount', '$maximumCapacity'] },
    }, { $inc: { currentBookingCount: 1 } }, { returnDocument: 'after', session });
    if (!reserved) throw new HttpError(409, 'The selected schedule is already full. Please choose another time.', { schedule: 'The selected schedule is already full. Please choose another time.' });
    const [booking] = await Booking.create([{
      client: clientId, vehicle: data.vehicle, services: data.services, schedule: data.schedule,
      bookingDate: reserved.date, bookingTime: reserved.timeSlot, bookingType,
      initialEstimatedDurationMinutes: estimatedDurationMinutes,
      estimatedDurationMinutes, reservedStartAt: period.startAt, reservedEndAt: period.endAt,
      concern: data.concern, status: bookingType === 'walk-in' ? 'checked_in' : 'pending',
      activity: [audit({ _id: creator.id, role: creator.role }, bookingType === 'walk-in' ? 'walk_in_created' : 'created')],
      ...(bookingType === 'walk-in' ? { createdByStaff: creator.id, createdByRole: creator.role,
        lastProcessedBy: creator.id, lastProcessedByRole: creator.role, lastProcessedAt: new Date() } : {}),
    }], { session });
    await engagement.recordBookingEvent(session, booking, bookingType === 'walk-in' ? 'walk_in_created' : 'created');
    if (bookingType === 'walk-in') await engagement.recordBookingEvent(session, booking, 'checked_in');
    return booking._id;
}
async function create(clientId, raw) { return createFor(clientId, raw, 'online'); }
async function createWalkIn(raw, staffId) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !['client', 'vehicle', 'services', 'schedule', 'concern'].includes(key))) {
    throw new HttpError(400, 'Invalid or unsupported walk-in fields.');
  }
  const clientId = id(raw.client, 'client');
  const { client, ...bookingData } = raw;
  return createFor(clientId, bookingData, 'walk-in', staffId);
}
function queryFilters(query, clientId) {
  const filter = clientId ? { client: clientId } : {};
  if (query.status && query.status !== 'all') {
    if (!allStatuses.includes(query.status)) throw new HttpError(400, 'Invalid booking status filter.');
    filter.status = query.status;
  }
  if (query.date) filter.bookingDate = scheduleService.date(query.date);
  return filter;
}
async function list(query, clientId) {
  const filter = queryFilters(query, clientId);
  if (query.search !== undefined) {
    if (clientId) throw new HttpError(400, 'Search is available to staff and Admin only.');
    if (typeof query.search !== 'string' || query.search.length > 100) throw new HttpError(400, 'Invalid search.');
    const search = query.search.trim();
    if (search) {
      const regex = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      const [clients, vehicles] = await Promise.all([
        User.find({ role: 'client', $or: [{ fullName: regex }, { email: regex }, { contactEmail: regex }, { phone: regex }] }).select('_id').lean(),
        Vehicle.find({ $or: [{ plateNumber: regex }, { make: regex }, { model: regex }] }).select('_id').lean(),
      ]);
      filter.$or = [{ client: { $in: clients.map(item => item._id) } }, { vehicle: { $in: vehicles.map(item => item._id) } }, { concern: regex }];
      if (mongoose.isObjectIdOrHexString(search)) filter.$or.push({ _id: search });
    }
  }
  const result = await require('../utils/pagination').listPage(Booking, filter, clientId ? {} : query,
    () => Booking.find(filter).sort({ bookingDate: -1, bookingTime: -1, createdAt: -1, _id: -1 }).populate(populate));
  return Array.isArray(result) ? result.map(publicBooking) : { ...result, items: result.items.map(publicBooking) };
}
async function get(rawId, clientId) {
  const filter = { _id: id(rawId, 'booking') };
  if (clientId) filter.client = clientId;
  const booking = await Booking.findOne(filter).populate(populate).lean();
  if (!booking) throw new HttpError(404, 'Booking not found.');
  return publicBooking(booking);
}
async function transition(rawId, actor, action) {
  const bookingId = id(rawId, 'booking');
  if (!['confirm', 'reject', 'cancel', 'check-in', 'no-show'].includes(action)) throw new HttpError(400, 'Invalid booking action.');
  if (action === 'no-show' && !['staff', 'admin'].includes(actor.role)) throw new HttpError(403, 'Access denied.');
  if (!['staff', 'admin', 'client'].includes(actor.role) || (actor.role === 'client' && action !== 'cancel')) throw new HttpError(403, 'Access denied.');
  const filter = { _id: bookingId };
  if (actor.role === 'client') filter.client = actor._id;
  if (action === 'confirm' || action === 'check-in') {
    const expected = action === 'confirm' ? 'pending' : 'confirmed';
    const next = action === 'confirm' ? 'confirmed' : 'checked_in';
    await mongoose.connection.transaction(async session => {
      const changed = await Booking.findOneAndUpdate({ ...filter, status: expected },
        { $set: { status: next, lastProcessedBy: actor._id, lastProcessedByRole: actor.role, lastProcessedAt: new Date() },
          $push: { activity: audit(actor, action) } }, { returnDocument: 'after', session });
      if (!changed) {
        await get(bookingId, filter.client);
        throw new HttpError(409, action === 'confirm' ? 'Only pending bookings can be confirmed.' : 'Only confirmed bookings can be checked in.');
      }
      await engagement.recordBookingEvent(session, changed, next);
    });
  } else {
    await mongoose.connection.transaction(async session => {
      const previous = await Booking.findOneAndUpdate({ ...filter,
        status: action === 'reject' ? 'pending' : action === 'no-show' ? 'confirmed' : { $in: releaseable },
      }, { $set: { status: action === 'reject' ? 'rejected' : action === 'no-show' ? 'no_show' : 'cancelled',
        ...(['staff', 'admin'].includes(actor.role) ? { lastProcessedBy: actor._id, lastProcessedByRole: actor.role, lastProcessedAt: new Date() } : {}) },
        $push: { activity: audit(actor, action) } },
      { returnDocument: 'before', session });
      if (!previous) {
        const exists = await Booking.findOne(filter).session(session).select('_id').lean();
        if (!exists) throw new HttpError(404, 'Booking not found.');
        throw new HttpError(409, 'Booking can no longer be changed at this stage.');
      }
      if (action === 'no-show' && new Date(`${previous.bookingDate}T${previous.bookingTime}:00+08:00`) > new Date()) {
        throw new HttpError(409, 'A booking can be marked No Show only after its scheduled time.');
      }
      const released = await Schedule.updateOne({ _id: previous.schedule, currentBookingCount: { $gt: 0 } },
        { $inc: { currentBookingCount: -1 } }, { session });
      if (released.modifiedCount !== 1) throw new HttpError(409, 'Capacity could not be released; booking was not changed.');
      await engagement.recordBookingEvent(session, previous,
        action === 'reject' ? 'rejected' : action === 'no-show' ? 'no_show' : 'cancelled', { actorRole: actor.role, actorId: actor._id });
    });
  }
  return get(bookingId, filter.client);
}
async function reschedule(rawId, raw, staffId) {
  const operator = identity(staffId);
  const bookingId = id(rawId, 'booking');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== 1 || !raw.schedule) {
    throw new HttpError(400, 'Select a new schedule.');
  }
  const scheduleId = id(raw.schedule, 'schedule');
  await mongoose.connection.transaction(async session => {
    const booking = await Booking.findOne({ _id: bookingId, status: { $in: ['pending', 'confirmed'] } }).session(session).lean();
    if (!booking) throw new HttpError(409, 'Only pending or confirmed bookings can be rescheduled.');
    if (String(booking.schedule) === String(scheduleId)) throw new HttpError(409, 'Choose a different schedule.');
    const slot = await Schedule.findById(scheduleId).session(session).lean();
    if (!slot || !slot.isEnabled || !scheduleService.isFuture(slot)) throw new HttpError(409, 'Selected schedule is unavailable.');
    const duration = booking.estimatedDurationMinutes || booking.initialEstimatedDurationMinutes
      || (booking.reservedStartAt && booking.reservedEndAt
        ? Math.round((booking.reservedEndAt - booking.reservedStartAt) / 60_000) : null);
    if (!duration) throw new HttpError(409, 'This older booking has no service duration. Update it before rescheduling.');
    const period = resourceAvailability.intervalFor(slot.date, slot.timeSlot, duration);
    if (!period || !scheduleService.withinWorkingHours(slot, period)) throw new HttpError(409, 'Services do not fit this schedule.');
    const fit = await resourceAvailability.canFitBooking(period, { session, excludeBookingId: bookingId });
    if (!fit.available) throw new HttpError(409, 'Mechanic or service bay capacity is unavailable.');
    const reserved = await Schedule.findOneAndUpdate({ _id: scheduleId, isEnabled: true,
      $expr: { $lt: ['$currentBookingCount', '$maximumCapacity'] } },
    { $inc: { currentBookingCount: 1 } }, { session });
    if (!reserved) throw new HttpError(409, 'The selected schedule is full.');
    const changed = await Booking.updateOne({ _id: bookingId, status: booking.status, schedule: booking.schedule },
      { $set: { schedule: scheduleId, bookingDate: slot.date, bookingTime: slot.timeSlot,
        reservedStartAt: period.startAt, reservedEndAt: period.endAt, lastProcessedBy: operator.id,
        lastProcessedByRole: operator.role, lastProcessedAt: new Date() },
      $push: { activity: audit(staffId, 'reschedule') } }, { session });
    if (changed.matchedCount !== 1) throw new HttpError(409, 'Booking changed during rescheduling.');
    const released = await Schedule.updateOne({ _id: booking.schedule, currentBookingCount: { $gt: 0 } },
      { $inc: { currentBookingCount: -1 } }, { session });
    if (released.modifiedCount !== 1) throw new HttpError(409, 'Previous schedule capacity could not be released.');
    await engagement.recordBookingEvent(session, { ...booking, schedule: scheduleId, bookingDate: slot.date,
      bookingTime: slot.timeSlot }, 'rescheduled', { version: `${booking.schedule}:${scheduleId}:${booking.lastProcessedAt?.getTime?.() || 'first'}` });
  });
  return get(bookingId);
}
module.exports = { input, reserveBooking, options, walkInClients, walkInVehicles, addWalkInVehicle, activeServiceIds, create, createWalkIn, list, get, transition, reschedule };
