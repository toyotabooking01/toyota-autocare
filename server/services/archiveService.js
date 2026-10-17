const mongoose = require('mongoose');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const Service = require('../models/Service');
const Booking = require('../models/Booking');
const JobOrder = require('../models/JobOrder');
const HttpError = require('../utils/HttpError');
const { listPage } = require('../utils/pagination');

const activeBookingStatuses = ['awaiting_downpayment', 'pending', 'confirmed', 'checked_in', 'mechanic_assigned',
  'in_service', 'final_inspection', 'ready_for_release'];
const historicalBookingStatuses = ['completed', 'cancelled', 'rejected', 'no_show'];
const userRoles = ['client', 'staff', 'mechanic'];
function id(raw) {
  if (!mongoose.isObjectIdOrHexString(raw)) throw new HttpError(400, 'Invalid record ID.');
  return raw;
}
function reason(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => key !== 'reason'))
    throw new HttpError(400, 'Invalid archive action.');
  if (raw.reason === undefined) return '';
  if (typeof raw.reason !== 'string' || raw.reason.trim().length > 300)
    throw new HttpError(400, 'Reason must be at most 300 characters.');
  return raw.reason.trim();
}
function admin(actor) {
  if (actor?.role !== 'admin') throw new HttpError(403, 'Access denied.');
}
function change(archived, actor, note, now, extra = {}) {
  return { $set: archived ? { isArchived: true, archivedAt: now, archivedBy: actor._id,
    archivedByRole: 'admin', archiveReason: note, ...extra }
    : { isArchived: false, archivedAt: null, restoredAt: now, restoredBy: actor._id,
      restoredByRole: 'admin', ...extra },
  $push: { archiveActivity: { action: archived ? 'archived' : 'restored', actor: actor._id,
    actorRole: 'admin', reason: note, timestamp: now } } };
}
async function user(rawId, archived, actor, body = {}, expectedRole) {
  admin(actor); const recordId = id(rawId); const note = reason(body);
  return mongoose.connection.transaction(async session => {
    const record = await User.findById(recordId).select('+availabilityBeforeArchive').session(session);
    if (!record) throw new HttpError(404, 'Account not found.');
    if (record.role === 'admin' || String(record._id) === String(actor._id))
      throw new HttpError(409, 'Admin accounts cannot be archived here.');
    if (!userRoles.includes(record.role) || (expectedRole && record.role !== expectedRole))
      throw new HttpError(404, 'Account not found.');
    if (record.isArchived === archived) return safeUser(record);
    if (archived && record.role === 'client' && await Booking.exists({ client: recordId,
      status: { $in: activeBookingStatuses } }).session(session))
      throw new HttpError(409, 'Client has an active booking and cannot be archived.');
    if (archived && record.role === 'mechanic') {
      const job = await JobOrder.exists({ mechanic: recordId, status: { $in: ['pending', 'in_progress'] } }).session(session);
      const booking = await Booking.exists({ assignedMechanic: recordId, status: { $in: activeBookingStatuses } }).session(session);
      if (job || booking) throw new HttpError(409, 'Mechanic has active service work and cannot be archived.');
    }
    const extra = record.role === 'mechanic' ? archived
      ? { availabilityBeforeArchive: record.availability, availability: 'off_duty' }
      : { availability: record.availabilityBeforeArchive || 'available' } : {};
    const result = await User.findOneAndUpdate({ _id: recordId, isArchived: archived ? { $ne: true } : true },
      { ...change(archived, actor, note, new Date(), extra), $inc: { authVersion: 1 } },
      { session, returnDocument: 'after', runValidators: true }).lean();
    if (!result) throw new HttpError(409, 'Account archive state changed. Retry the action.');
    return safeUser(result);
  });
}
function safeUser(record) {
  const item = record.toObject ? record.toObject() : { ...record };
  delete item.password; delete item.authVersion; delete item.otpSequence;
  delete item.credentialDelivery; delete item.bookingLockVersion; delete item.availabilityBeforeArchive;
  return item;
}
async function vehicle(rawId, archived, actor, body = {}) {
  admin(actor); const recordId = id(rawId); const note = reason(body);
  return mongoose.connection.transaction(async session => {
    const record = await Vehicle.findById(recordId).session(session);
    if (!record) throw new HttpError(404, 'Vehicle not found.');
    if (record.isArchived === archived) return record;
    if (archived && await Booking.exists({ vehicle: recordId, status: { $in: activeBookingStatuses } }).session(session))
      throw new HttpError(409, 'Vehicle has an active booking and cannot be archived.');
    if (!archived) {
      const owner = await User.exists({ _id: record.owner, role: 'client', status: 'active', isArchived: false }).session(session);
      if (!owner) throw new HttpError(409, 'Restore the active Client account before restoring this vehicle.');
    }
    const result = await Vehicle.findOneAndUpdate({ _id: recordId, isArchived: archived ? { $ne: true } : true },
      change(archived, actor, note, new Date()), { session, returnDocument: 'after', runValidators: true });
    if (!result) throw new HttpError(409, 'Vehicle archive state changed. Retry the action.');
    return result;
  });
}
async function service(rawId, archived, actor, body = {}) {
  admin(actor); const recordId = id(rawId); const note = reason(body);
  return mongoose.connection.transaction(async session => {
    const record = await Service.findById(recordId).session(session);
    if (!record) throw new HttpError(404, 'Service not found.');
    if (record.isArchived === archived) return record;
    if (archived && record.isOtherService) throw new HttpError(409, 'The Other diagnostic service must remain available.');
    const result = await Service.findOneAndUpdate({ _id: recordId, isArchived: archived ? { $ne: true } : true },
      change(archived, actor, note, new Date()), { session, returnDocument: 'after', runValidators: true });
    if (!result) throw new HttpError(409, 'Service archive state changed. Retry the action.');
    return result;
  });
}
function search(raw) {
  if (raw === undefined || raw === '') return null;
  if (typeof raw !== 'string' || raw.length > 100) throw new HttpError(400, 'Invalid search.');
  return { $regex: raw.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
}
function scope(raw) {
  const value = raw || 'archived';
  if (!['active', 'archived'].includes(value)) throw new HttpError(400, 'Invalid archive view.');
  return value === 'archived';
}
async function list(category, query = {}) {
  if (!['users', 'vehicles', 'services', 'history'].includes(category)) throw new HttpError(400, 'Invalid archive category.');
  const pattern = search(query.search);
  if (category === 'history') {
    const filter = { status: { $in: historicalBookingStatuses } };
    if (pattern) {
      const [vehicles, clients, services] = await Promise.all([
        Vehicle.find({ $or: [{ plateNumber: pattern }, { make: pattern }, { model: pattern }] }).select('_id').lean(),
        User.find({ fullName: pattern, role: 'client' }).select('_id').lean(),
        Service.find({ name: pattern }).select('_id').lean(),
      ]);
      filter.$or = [
        { vehicle: { $in: vehicles.map(item => item._id) } },
        { client: { $in: clients.map(item => item._id) } },
        { services: { $in: services.map(item => item._id) } },
      ];
      const rawSearch = query.search?.trim();
      if (mongoose.isObjectIdOrHexString(rawSearch)) filter.$or.push({ _id: rawSearch });
    }
    return listPage(Booking, filter, query, () => Booking.find(filter)
      .select('bookingDate bookingTime status bookingType client vehicle services releasedAt')
      .populate([{ path: 'client', select: 'fullName' }, { path: 'vehicle', select: 'make model plateNumber' },
        { path: 'services', select: 'name' }]).sort({ bookingDate: -1, _id: -1 }));
  }
  const archived = scope(query.scope);
  if (category === 'users') {
    if (query.role && !userRoles.includes(query.role)) throw new HttpError(400, 'Invalid user role filter.');
    const filter = { role: query.role || { $in: userRoles }, isArchived: archived };
    if (pattern) filter.$or = ['fullName', 'email', 'phone', 'employeeId', 'staffId'].map(field => ({ [field]: pattern }));
    const result = await listPage(User, filter, query, () => User.find(filter)
      .select('fullName email phone role employeeId staffId status availability isArchived archivedAt archivedBy archiveReason restoredAt createdAt')
      .populate('archivedBy', 'fullName').sort({ archivedAt: -1, fullName: 1, _id: 1 }));
    return addCounts(result, 'users');
  }
  if (category === 'vehicles') {
    const filter = { isArchived: archived };
    if (pattern) {
      const owners = await User.find({ fullName: pattern }).select('_id').lean();
      filter.$or = [{ plateNumber: pattern }, { make: pattern }, { model: pattern }, { owner: { $in: owners.map(item => item._id) } }];
    }
    const result = await listPage(Vehicle, filter, query, () => Vehicle.find(filter)
      .select('make model year variant plateNumber owner isArchived archivedAt archivedBy archiveReason restoredAt')
      .populate([{ path: 'owner', select: 'fullName status isArchived' }, { path: 'archivedBy', select: 'fullName' }])
      .sort({ archivedAt: -1, plateNumber: 1, _id: 1 }));
    return addCounts(result, 'vehicles');
  }
  const filter = { isArchived: archived };
  if (pattern) filter.$or = [{ name: pattern }, { type: pattern }];
  const result = await listPage(Service, filter, query, () => Service.find(filter)
    .select('name description type estimatedDuration estimatedPrice maintenanceReminderInterval maintenanceIntervalKm isActive isOtherService isArchived archivedAt archivedBy archiveReason restoredAt')
    .populate('archivedBy', 'fullName').sort({ archivedAt: -1, name: 1, _id: 1 }));
  return addCounts(result, 'services');
}
async function addCounts(result, category) {
  const items = Array.isArray(result) ? result : result.items;
  if (!items.length) return result;
  const ids = items.map(item => item._id);
  let rows;
  if (category === 'vehicles') rows = await Booking.aggregate([{ $match: { vehicle: { $in: ids }, status: 'completed' } },
    { $group: { _id: '$vehicle', count: { $sum: 1 } } }]);
  else if (category === 'services') rows = await Booking.aggregate([{ $match: { status: 'completed', services: { $in: ids } } },
    { $unwind: '$services' }, { $match: { services: { $in: ids } } }, { $group: { _id: '$services', count: { $sum: 1 } } }]);
  else {
    const clients = items.filter(item => item.role === 'client').map(item => item._id);
    const mechanics = items.filter(item => item.role === 'mechanic').map(item => item._id);
    const staff = items.filter(item => item.role === 'staff').map(item => item._id);
    const [clientRows, mechanicRows, staffRows] = await Promise.all([
      Booking.aggregate([{ $match: { client: { $in: clients } } }, { $group: { _id: '$client', count: { $sum: 1 } } }]),
      JobOrder.aggregate([{ $match: { mechanic: { $in: mechanics }, status: 'completed' } },
        { $group: { _id: '$mechanic', count: { $sum: 1 } } }]),
      Booking.aggregate([{ $match: { lastProcessedBy: { $in: staff } } },
        { $group: { _id: '$lastProcessedBy', count: { $sum: 1 } } }]),
    ]);
    rows = [...clientRows, ...mechanicRows, ...staffRows];
  }
  const counts = new Map(rows.map(row => [String(row._id), row.count]));
  const annotated = items.map(item => ({ ...item, historicalCount: counts.get(String(item._id)) || 0 }));
  return Array.isArray(result) ? annotated : { ...result, items: annotated };
}
async function get(category, rawId) {
  const recordId = id(rawId);
  const Model = { users: User, vehicles: Vehicle, services: Service }[category];
  if (!Model) throw new HttpError(400, 'Invalid archive category.');
  const query = Model.findById(recordId);
  if (category === 'users') query.select('fullName email phone role employeeId staffId status availability isArchived archivedAt archivedBy archivedByRole archiveReason restoredAt restoredBy restoredByRole archiveActivity createdAt');
  else if (category === 'vehicles') query.select('make model year variant plateNumber owner currentMileage isArchived archivedAt archivedBy archivedByRole archiveReason restoredAt restoredBy restoredByRole archiveActivity');
  else query.select('name description type estimatedDuration estimatedPrice maintenanceReminderInterval maintenanceIntervalKm checklistTemplate isActive isOtherService isArchived archivedAt archivedBy archivedByRole archiveReason restoredAt restoredBy restoredByRole archiveActivity');
  query.populate([{ path: 'archivedBy', select: 'fullName' }, { path: 'restoredBy', select: 'fullName' },
    { path: 'archiveActivity.actor', select: 'fullName' }, ...(category === 'vehicles' ? [{ path: 'owner', select: 'fullName status isArchived' }] : [])]);
  const item = await query.lean();
  if (!item || (category === 'users' && !userRoles.includes(item.role))) throw new HttpError(404, 'Record not found.');
  const annotated = await addCounts([item], category);
  if (category === 'users' && item.role === 'client') annotated[0].archivedVehicles = await Vehicle.countDocuments({ owner: recordId, isArchived: true });
  return annotated[0];
}
module.exports = { user, vehicle, service, list, get, activeBookingStatuses, reason };
