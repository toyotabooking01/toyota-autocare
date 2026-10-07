const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Schedule = require('../models/Schedule');
const Service = require('../models/Service');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const HttpError = require('../utils/HttpError');
const scheduleService = require('./scheduleService');
const engagement = require('./engagementService');

const releaseable = ['pending', 'confirmed'];
const allStatuses = ['pending', 'confirmed', 'checked_in', 'mechanic_assigned', 'in_service',
  'final_inspection', 'ready_for_release', 'completed', 'cancelled', 'rejected', 'no_show'];
const populate = [
  { path: 'client', select: 'fullName email' },
  { path: 'vehicle', select: 'make model year plateNumber isArchived' },
  { path: 'services', select: 'name estimatedDuration estimatedPrice isActive isArchived' },
  { path: 'schedule', select: 'date timeSlot isEnabled maximumCapacity currentBookingCount' },
  { path: 'assignedMechanic', select: 'fullName' },
  { path: 'assignedServiceBay', select: 'name' },
];

function id(raw, label) {
  if (!mongoose.isObjectIdOrHexString(raw)) throw new HttpError(400, `Invalid ${label} ID.`);
  return raw;
}
function input(raw) {
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
    .select('name description estimatedDuration estimatedPrice').sort({ name: 1 }).lean();
}
async function walkInClients(rawSearch) {
  if (typeof rawSearch !== 'string' || rawSearch.trim().length < 2 || rawSearch.length > 100) {
    throw new HttpError(400, 'Enter at least two characters to search clients.');
  }
  const search = { $regex: rawSearch.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  const clients = await User.find({ role: 'client', status: 'active', isArchived: false,
    $or: [{ fullName: search }, { email: search }] })
    .select('_id fullName email').sort({ fullName: 1 }).limit(20).lean();
  return clients.map(client => ({ _id: client._id, fullName: client.fullName, email: client.email }));
}
async function walkInVehicles(rawClientId) {
  const clientId = id(rawClientId, 'client');
  if (!await User.exists({ _id: clientId, role: 'client', status: 'active', isArchived: false })) {
    throw new HttpError(404, 'Eligible client not found.');
  }
  const vehicles = await Vehicle.find({ owner: clientId, isArchived: false })
    .select('_id make model year plateNumber').sort({ createdAt: -1 }).lean();
  return vehicles.map(vehicle => ({ _id: vehicle._id, make: vehicle.make, model: vehicle.model,
    year: vehicle.year, plateNumber: vehicle.plateNumber }));
}
async function createFor(clientId, raw, bookingType) {
  const data = input(raw);
  let createdId;
  await mongoose.connection.transaction(async session => {
    if (bookingType === 'walk-in') {
      const client = await User.exists({ _id: clientId, role: 'client', status: 'active', isArchived: false }).session(session);
      if (!client) throw new HttpError(400, 'Select an active client account.');
    }
    const vehicle = await Vehicle.exists({ _id: data.vehicle, owner: clientId, isArchived: false }).session(session);
    if (!vehicle) throw new HttpError(400, 'Select one of your current vehicles.');
    const serviceCount = await Service.countDocuments({ _id: { $in: data.services }, isActive: true, isArchived: false }).session(session);
    if (serviceCount !== data.services.length) throw new HttpError(400, 'One or more services are unavailable.');
    const slot = await Schedule.findById(data.schedule).session(session).lean();
    if (!slot || !slot.isEnabled || !scheduleService.isFuture(slot)) throw new HttpError(409, 'Selected schedule is unavailable. Please choose another time.');
    const reserved = await Schedule.findOneAndUpdate({
      _id: data.schedule, isEnabled: true, date: slot.date, timeSlot: slot.timeSlot,
      $expr: { $lt: ['$currentBookingCount', '$maximumCapacity'] },
    }, { $inc: { currentBookingCount: 1 } }, { returnDocument: 'after', session });
    if (!reserved) throw new HttpError(409, 'The selected schedule is already full. Please choose another time.');
    const [booking] = await Booking.create([{
      client: clientId, vehicle: data.vehicle, services: data.services, schedule: data.schedule,
      bookingDate: reserved.date, bookingTime: reserved.timeSlot, bookingType,
      concern: data.concern, status: bookingType === 'walk-in' ? 'confirmed' : 'pending',
    }], { session });
    if (bookingType === 'walk-in') await engagement.recordBookingEvent(session, booking, 'confirmed');
    createdId = booking._id;
  });
  return get(createdId, bookingType === 'online' ? clientId : undefined);
}
async function create(clientId, raw) { return createFor(clientId, raw, 'online'); }
async function createWalkIn(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !['client', 'vehicle', 'services', 'schedule', 'concern'].includes(key))) {
    throw new HttpError(400, 'Invalid or unsupported walk-in fields.');
  }
  const clientId = id(raw.client, 'client');
  const { client, ...bookingData } = raw;
  return createFor(clientId, bookingData, 'walk-in');
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
    if (clientId) throw new HttpError(400, 'Search is available to Admin only.');
    if (typeof query.search !== 'string' || query.search.length > 100) throw new HttpError(400, 'Invalid search.');
    const search = query.search.trim();
    if (search) {
      const regex = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      const [clients, vehicles] = await Promise.all([
        User.find({ role: 'client', $or: [{ fullName: regex }, { email: regex }] }).select('_id').lean(),
        Vehicle.find({ $or: [{ plateNumber: regex }, { make: regex }, { model: regex }] }).select('_id').lean(),
      ]);
      filter.$or = [{ client: { $in: clients.map(item => item._id) } }, { vehicle: { $in: vehicles.map(item => item._id) } }, { concern: regex }];
      if (mongoose.isObjectIdOrHexString(search)) filter.$or.push({ _id: search });
    }
  }
  return Booking.find(filter).sort({ bookingDate: -1, bookingTime: -1, createdAt: -1 }).populate(populate).lean();
}
async function get(rawId, clientId) {
  const filter = { _id: id(rawId, 'booking') };
  if (clientId) filter.client = clientId;
  const booking = await Booking.findOne(filter).populate(populate).lean();
  if (!booking) throw new HttpError(404, 'Booking not found.');
  return booking;
}
async function transition(rawId, actor, action) {
  const bookingId = id(rawId, 'booking');
  if (!['confirm', 'reject', 'cancel', 'check-in'].includes(action)) throw new HttpError(400, 'Invalid booking action.');
  if (actor.role === 'client' && action !== 'cancel') throw new HttpError(403, 'Access denied.');
  const filter = { _id: bookingId };
  if (actor.role === 'client') filter.client = actor._id;
  if (action === 'confirm' || action === 'check-in') {
    const expected = action === 'confirm' ? 'pending' : 'confirmed';
    const next = action === 'confirm' ? 'confirmed' : 'checked_in';
    await mongoose.connection.transaction(async session => {
      const changed = await Booking.findOneAndUpdate({ ...filter, status: expected },
        { $set: { status: next } }, { returnDocument: 'after', session });
      if (!changed) {
        await get(bookingId, filter.client);
        throw new HttpError(409, action === 'confirm' ? 'Only pending bookings can be confirmed.' : 'Only confirmed bookings can be checked in.');
      }
      await engagement.recordBookingEvent(session, changed, next);
    });
  } else {
    await mongoose.connection.transaction(async session => {
      const previous = await Booking.findOneAndUpdate({ ...filter,
        status: action === 'reject' ? 'pending' : { $in: releaseable },
      }, { $set: { status: action === 'reject' ? 'rejected' : 'cancelled' } },
      { returnDocument: 'before', session });
      if (!previous) {
        const exists = await Booking.findOne(filter).session(session).select('_id').lean();
        if (!exists) throw new HttpError(404, 'Booking not found.');
        throw new HttpError(409, 'Booking can no longer be changed at this stage.');
      }
      const released = await Schedule.updateOne({ _id: previous.schedule, currentBookingCount: { $gt: 0 } },
        { $inc: { currentBookingCount: -1 } }, { session });
      if (released.modifiedCount !== 1) throw new HttpError(409, 'Capacity could not be released; booking was not changed.');
      await engagement.recordBookingEvent(session, previous, action === 'reject' ? 'rejected' : 'cancelled');
    });
  }
  return get(bookingId, filter.client);
}
module.exports = { input, options, walkInClients, walkInVehicles, create, createWalkIn, list, get, transition };
