const Booking = require('../models/Booking');
const scheduleService = require('./scheduleService');

const statuses = ['awaiting_downpayment', 'pending', 'confirmed', 'checked_in', 'mechanic_assigned', 'in_service',
  'final_inspection', 'ready_for_release', 'completed', 'cancelled', 'rejected', 'no_show'];

function range(query = {}) {
  const today = scheduleService.manilaNow().date;
  const defaultFrom = new Date(`${today}T00:00:00.000Z`);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);
  const from = query.from || defaultFrom.toISOString().slice(0, 10);
  const to = query.to || today;
  require('../utils/validateForm')('report', { from, to });
  return { from, to };
}
function summarize(bookings, selectedRange) {
  const byStatus = Object.fromEntries(statuses.map(status => [status, 0]));
  const bySource = { online: 0, 'walk-in': 0 };
  const days = new Map(); const services = new Map(); const mechanics = new Map(); const bays = new Map(); const staff = new Map();
  let completedBookings = 0; let completedServices = 0; let completedEstimate = 0;
  for (const booking of bookings) {
    if (booking.status in byStatus) byStatus[booking.status]++;
    if (booking.bookingType in bySource) bySource[booking.bookingType]++;
    if (booking.lastProcessedBy?._id) {
      const user = booking.lastProcessedBy; const key = String(user._id);
      const item = staff.get(key) || { id: key, name: user.fullName, processed: 0 };
      item.processed++; staff.set(key, item);
    }
    const day = days.get(booking.bookingDate) || { date: booking.bookingDate, bookings: 0, completed: 0 };
    day.bookings++;
    if (booking.status === 'completed') { day.completed++; completedBookings++; }
    days.set(booking.bookingDate, day);
    for (const service of booking.services || []) {
      if (!service) continue;
      const key = String(service._id);
      const item = services.get(key) || { id: key, name: service.name, bookings: 0, completed: 0 };
      item.bookings++;
      if (booking.status === 'completed') {
        item.completed++; completedServices++;
        completedEstimate += (booking.estimatedServiceItems || []).filter(item => String(item.serviceId) === key)
          .reduce((sum, item) => sum + Number(item.priceCents || 0), 0) / 100;
      }
      services.set(key, item);
    }
    if (booking.assignedMechanic?._id) {
      const user = booking.assignedMechanic; const key = String(user._id);
      const item = mechanics.get(key) || { id: key, name: user.fullName, assigned: 0, active: 0, completed: 0 };
      item.assigned++;
      if (booking.status === 'completed') item.completed++;
      else if (!['cancelled', 'rejected', 'no_show'].includes(booking.status)) item.active++;
      mechanics.set(key, item);
    }
    if (booking.assignedServiceBay?._id) {
      const bay = booking.assignedServiceBay; const key = String(bay._id);
      const item = bays.get(key) || { id: key, name: bay.name, visits: 0, active: 0, completed: 0 };
      item.visits++;
      if (booking.status === 'completed') item.completed++;
      else if (!['cancelled', 'rejected', 'no_show'].includes(booking.status)) item.active++;
      bays.set(key, item);
    }
  }
  return { range: selectedRange, totalBookings: bookings.length, byStatus, bySource,
    completedBookings, completedServices, completedEstimate,
    bookingsByDate: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    servicePopularity: [...services.values()].sort((a, b) => b.bookings - a.bookings || a.name.localeCompare(b.name)),
    mechanicWorkload: [...mechanics.values()].sort((a, b) => b.assigned - a.assigned || a.name.localeCompare(b.name)),
    staffActivity: [...staff.values()].sort((a, b) => b.processed - a.processed || a.name.localeCompare(b.name)),
    serviceBayUsage: [...bays.values()].sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name)),
  };
}
async function summary(query) {
  const selectedRange = range(query);
  const bookings = await Booking.find({ bookingDate: { $gte: selectedRange.from, $lte: selectedRange.to } })
    .select('bookingDate status bookingType services estimatedServiceItems assignedMechanic assignedServiceBay lastProcessedBy')
    .populate([{ path: 'services', select: 'name' },
      { path: 'assignedMechanic', select: 'fullName' },
      { path: 'lastProcessedBy', select: 'fullName' },
      { path: 'assignedServiceBay', select: 'name' }]).lean();
  return summarize(bookings, selectedRange);
}
module.exports = { range, summarize, summary };
