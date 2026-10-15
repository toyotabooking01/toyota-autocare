const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const MaintenanceReminder = require('../models/MaintenanceReminder');
const Service = require('../models/Service');
const User = require('../models/User');
const HttpError = require('../utils/HttpError');

const eventContent = {
  created: ['Booking created', 'Your booking request has been received.'],
  walk_in_created: ['Walk-in booking created', 'Your walk-in booking has been created.'],
  rescheduled: ['Booking rescheduled', 'Your booking has been rescheduled.'],
  confirmed: ['Booking confirmed', 'Your service booking is confirmed.'],
  rejected: ['Booking rejected', 'Your service booking was rejected.'],
  cancelled: ['Booking cancelled', 'Your service booking was cancelled.'],
  checked_in: ['Vehicle checked in', 'Your vehicle has been checked in.'],
  mechanic_assigned: ['Mechanic assigned', 'A mechanic has been assigned to your vehicle.'],
  in_service: ['Service started', 'Service on your vehicle has started.'],
  final_inspection: ['Final inspection', 'Your vehicle is undergoing final inspection.'],
  ready_for_release: ['Ready for release', 'Your vehicle is ready for release.'],
  completed: ['Service completed', 'Your service has been completed.'],
  no_show: ['Booking marked No Show', 'Your booking was marked as a no show.'],
};
function id(raw) {
  if (!mongoose.isObjectIdOrHexString(raw)) throw new HttpError(400, 'Invalid record ID.');
  return raw;
}
async function recordNotification(session, { user, eventKey, title, message, type, bookingId, jobOrderId,
  paymentId, vehicleId, serviceBayId, maintenanceReminderId, relatedUserId, path }) {
  if (!user) return;
  try {
    await Notification.updateOne({ eventKey }, { $setOnInsert: {
      user, eventKey, title, message, type, bookingId, jobOrderId, paymentId, vehicleId, serviceBayId,
      maintenanceReminderId, relatedUserId, path,
    } }, { upsert: true, ...(session ? { session } : {}) });
  } catch (error) {
    // Two simultaneous polls may race to insert the same reminder event.
    if (error.code !== 11000 || !(error.keyPattern?.eventKey || error.keyValue?.eventKey)) throw error;
  }
}
async function activeStaff(session) {
  const query = User.find({ role: 'staff', status: 'active', isArchived: false }).select('_id');
  return (session ? query.session(session) : query).lean();
}
async function activeAdmins(session) {
  const query = User.find({ role: 'admin', status: 'active', isArchived: false }).select('_id');
  return (session ? query.session(session) : query).lean();
}
async function recordAccountEvent(account, action) {
  const version = action === 'created' ? 'created' : account.updatedAt?.getTime?.() || Date.now();
  const label = account.role === 'mechanic' ? 'Mechanic' : 'Staff';
  const title = action === 'created' ? `${label} account created` : `Account ${action}`;
  const message = action === 'created' ? 'Your account has been created.' : `Your account has been ${action}.`;
  await recordNotification(null, { user: account._id, eventKey: `account:${account._id}:${action}:${version}`,
    title, message, type: 'system', relatedUserId: account._id, path: `/${account.role}/profile` });
  const admins = await activeAdmins();
  for (const admin of admins) await recordNotification(null, { user: admin._id,
    eventKey: `account:${account._id}:${action}:${version}:admin:${admin._id}`,
    title, message: `${label} account ${action}.`, type: 'system', relatedUserId: account._id,
    path: account.role === 'mechanic' ? '/admin/mechanics' : '/admin/staff' });
}
async function recordBayProblem(bay) {
  if (bay.operationalStatus === 'operational') return;
  const admins = await activeAdmins();
  for (const admin of admins) await recordNotification(null, { user: admin._id,
    eventKey: `bay:${bay._id}:${bay.operationalStatus}:${bay.updatedAt?.getTime?.() || 'current'}:admin:${admin._id}`,
    title: 'Service bay operational problem', message: `Service bay ${bay.name} is ${bay.operationalStatus.replaceAll('_', ' ')}.`,
    type: 'system', serviceBayId: bay._id, path: '/admin/service-bays' });
}
async function recordBookingEvent(session, booking, status, options = {}) {
  const content = eventContent[status];
  if (!content) throw new Error('Unsupported booking notification event.');
  const bookingId = booking._id;
  const reference = ` Reference ${String(bookingId).slice(-6).toUpperCase()}.`;
  const version = options.version ? `:${options.version}` : '';
  const key = `${bookingId}:${status}${version}`;
  const related = { bookingId, vehicleId: booking.vehicle, relatedUserId: booking.client, jobOrderId: options.jobOrderId };
  const jobEvent = ['mechanic_assigned', 'in_service', 'final_inspection', 'ready_for_release', 'completed'].includes(status);
  const detail = status === 'rescheduled' && booking.bookingDate && booking.bookingTime
    ? ` New schedule: ${booking.bookingDate} at ${booking.bookingTime}.` : '';
  await recordNotification(session, { user: booking.client, eventKey: key, title: content[0],
    message: content[1] + detail + reference, type: jobEvent ? 'job_order' : 'booking', ...related });
  if (status === 'mechanic_assigned' && booking.assignedMechanic) {
    await recordNotification(session, { user: booking.assignedMechanic, eventKey: `${key}:mechanic:${booking.assignedMechanic}`,
      title: 'Job assigned', message: 'A new service job has been assigned to you.' + reference,
      type: 'job_order', ...related });
  }
  const staffMessage = {
    created: ['New online booking', 'An online booking needs processing.'],
    checked_in: ['Vehicle checked in', 'A checked-in vehicle needs a mechanic and service bay.'],
    mechanic_assigned: ['Mechanic and bay assigned', 'A mechanic and service bay were assigned to a checked-in vehicle.'],
    cancelled: ['Booking cancelled', 'A booking was cancelled and the schedule has changed.'],
    rescheduled: ['Booking rescheduled', 'A booking schedule has changed.'],
    final_inspection: ['Final inspection complete', 'A job is ready for release review.'],
    ready_for_release: ['Vehicle ready for release', 'A vehicle is ready for release processing.'],
  }[status];
  if (staffMessage && !(status === 'cancelled' && options.actorRole === 'staff')) {
    for (const staff of await activeStaff(session)) {
      await recordNotification(session, { user: staff._id, eventKey: `${key}:staff:${staff._id}`,
        title: staffMessage[0], message: staffMessage[1] + detail + reference,
        type: jobEvent ? 'job_order' : 'booking', ...related });
    }
  }
  if (status === 'no_show' || status === 'rejected') {
    for (const admin of await activeAdmins(session)) {
      if (options.actorRole === 'admin' && String(admin._id) === String(options.actorId)) continue;
      await recordNotification(session, { user: admin._id, eventKey: `${key}:admin:${admin._id}`,
        title: status === 'no_show' ? 'Booking no-show' : 'Booking rejected',
        message: `A booking requires monitoring.${reference}`, type: 'booking', ...related });
    }
  }
}
async function updateReminders(session, booking, completedAt) {
  const services = await Service.find({ _id: { $in: booking.services } })
    .select('_id maintenanceReminderInterval').session(session).lean();
  for (const service of services) {
    const filter = { client: booking.client, vehicle: booking.vehicle, service: service._id };
    if (service.maintenanceReminderInterval == null) {
      await MaintenanceReminder.updateOne({ ...filter, status: { $in: ['pending', 'sent'] } },
        { $set: { status: 'completed' } }, { session });
      continue;
    }
    const next = new Date(completedAt);
    next.setUTCDate(next.getUTCDate() + service.maintenanceReminderInterval);
    const reminder = await MaintenanceReminder.findOneAndUpdate(filter, { $set: {
      lastServiceDate: completedAt, nextRecommendedServiceDate: next, status: 'pending',
    } }, { upsert: true, returnDocument: 'after', session });
    if (reminder?._id) await recordNotification(session, {
      user: booking.client, eventKey: `reminder:${reminder._id}:${next.toISOString()}:created`,
      title: 'New maintenance reminder', message: 'Your next recommended service date has been scheduled.',
      type: 'maintenance_reminder', vehicleId: booking.vehicle, maintenanceReminderId: reminder._id,
      relatedUserId: booking.client,
    });
  }
}
async function syncDueReminders(user) {
  if (user.role !== 'client') return;
  const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const soon = new Date(`${today}T00:00:00+08:00`);
  soon.setUTCDate(soon.getUTCDate() + 8);
  const due = await MaintenanceReminder.find({ client: user._id, status: { $in: ['pending', 'sent'] },
    nextRecommendedServiceDate: { $lt: soon } }).select('_id client vehicle nextRecommendedServiceDate').lean();
  for (const reminder of due) {
    const date = new Date(new Date(reminder.nextRecommendedServiceDate).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const stage = date < today ? 'overdue' : date === today ? 'today' : 'soon';
    const content = { soon: ['Maintenance due soon', 'A recommended service is due soon.'],
      today: ['Maintenance due today', 'A recommended service is due today.'],
      overdue: ['Maintenance overdue', 'A recommended service is overdue.'] }[stage];
    await recordNotification(null, { user: user._id, eventKey: `reminder:${reminder._id}:${date}:${stage}`,
      title: content[0], message: content[1], type: 'maintenance_reminder',
      vehicleId: reminder.vehicle, maintenanceReminderId: reminder._id, relatedUserId: user._id });
  }
}
async function notifications(userId) {
  return Notification.find({ user: userId }).select('_id title message type bookingId jobOrderId vehicleId serviceBayId maintenanceReminderId relatedUserId path isRead createdAt')
    .sort({ createdAt: -1, _id: -1 }).lean();
}
async function unreadCount(userId) {
  return Notification.countDocuments({ user: userId, isRead: false });
}
async function markRead(userId, rawId) {
  const item = await Notification.findOneAndUpdate({ _id: id(rawId), user: userId },
    { $set: { isRead: true } }, { returnDocument: 'after' });
  if (!item) throw new HttpError(404, 'Notification not found.');
  return { _id: item._id, title: item.title, message: item.message, type: item.type,
    bookingId: item.bookingId, jobOrderId: item.jobOrderId, vehicleId: item.vehicleId, serviceBayId: item.serviceBayId,
    maintenanceReminderId: item.maintenanceReminderId, relatedUserId: item.relatedUserId, path: item.path,
    isRead: item.isRead, createdAt: item.createdAt };
}
async function markAllRead(userId) {
  const result = await Notification.updateMany({ user: userId, isRead: false }, { $set: { isRead: true } });
  return { updated: result.modifiedCount };
}
async function reminders(clientId, query = {}) {
  const filter = clientId ? { client: clientId } : {};
  return require('../utils/pagination').listPage(MaintenanceReminder, filter, clientId ? {} : query, () => MaintenanceReminder.find(filter)
    .sort({ nextRecommendedServiceDate: 1, _id: 1 })
    .populate([{ path: 'vehicle', select: 'make model year plateNumber' },
      { path: 'service', select: 'name maintenanceReminderInterval' },
      { path: 'client', select: 'fullName' }]));
}
module.exports = { recordNotification, recordBookingEvent, recordAccountEvent, recordBayProblem, updateReminders, syncDueReminders,
  notifications, unreadCount, markRead, markAllRead, reminders };
