const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const MaintenanceReminder = require('../models/MaintenanceReminder');
const Service = require('../models/Service');
const HttpError = require('../utils/HttpError');

const eventContent = {
  confirmed: ['Booking confirmed', 'Your service booking is confirmed.'],
  rejected: ['Booking rejected', 'Your service booking was rejected.'],
  cancelled: ['Booking cancelled', 'Your service booking was cancelled.'],
  checked_in: ['Checked in', 'Your vehicle has been checked in.'],
  mechanic_assigned: ['Mechanic assigned', 'A mechanic and service bay have been assigned.'],
  in_service: ['Service started', 'Work on your vehicle has started.'],
  final_inspection: ['Final inspection', 'Your vehicle is undergoing final inspection.'],
  ready_for_release: ['Ready for release', 'Your vehicle is ready for release.'],
  completed: ['Service completed', 'Your service visit is complete.'],
};
function id(raw) {
  if (!mongoose.isObjectIdOrHexString(raw)) throw new HttpError(400, 'Invalid record ID.');
  return raw;
}
async function recordBookingEvent(session, booking, status) {
  const content = eventContent[status];
  if (!content) throw new Error('Unsupported booking notification event.');
  await Notification.updateOne({ eventKey: `${booking._id}:${status}` }, { $setOnInsert: {
    user: booking.client, title: content[0], message: `${content[1]} Reference ${String(booking._id).slice(-6).toUpperCase()}.`,
    type: status === 'mechanic_assigned' || ['in_service', 'final_inspection', 'ready_for_release', 'completed'].includes(status) ? 'job_order' : 'booking',
    eventKey: `${booking._id}:${status}`,
  } }, { upsert: true, session });
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
    await MaintenanceReminder.findOneAndUpdate(filter, { $set: {
      lastServiceDate: completedAt, nextRecommendedServiceDate: next, status: 'pending',
    } }, { upsert: true, returnDocument: 'after', session });
  }
}
async function notifications(userId) {
  return Notification.find({ user: userId }).select('_id title message type isRead createdAt')
    .sort({ createdAt: -1 }).lean();
}
async function unreadCount(userId) {
  return Notification.countDocuments({ user: userId, isRead: false });
}
async function markRead(userId, rawId) {
  const item = await Notification.findOneAndUpdate({ _id: id(rawId), user: userId },
    { $set: { isRead: true } }, { returnDocument: 'after' });
  if (!item) throw new HttpError(404, 'Notification not found.');
  return { _id: item._id, title: item.title, message: item.message, type: item.type,
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
module.exports = { recordBookingEvent, updateReminders, notifications, unreadCount, markRead, markAllRead, reminders };
