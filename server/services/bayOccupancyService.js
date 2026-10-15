const JobOrder = require('../models/JobOrder');
const Booking = require('../models/Booking');

const activeJobStatuses = ['pending', 'in_progress'];
const activeBookingStatuses = ['mechanic_assigned', 'in_service', 'final_inspection', 'ready_for_release'];

async function forBays(bays, session) {
  if (!bays.length) return new Map();
  const ids = bays.map(bay => bay._id);
  const jobQuery = JobOrder.find({ serviceBay: { $in: ids }, status: { $in: activeJobStatuses } })
    .select('_id serviceBay booking status');
  const bookingQuery = Booking.find({ assignedServiceBay: { $in: ids }, status: { $in: activeBookingStatuses } })
    .select('_id assignedServiceBay vehicle status').populate({ path: 'vehicle', select: 'plateNumber' });
  if (session) { jobQuery.session(session); bookingQuery.session(session); }
  const [jobs, bookings] = await Promise.all([jobQuery.lean(), bookingQuery.lean()]);
  const bookingById = new Map(bookings.map(booking => [String(booking._id), booking]));
  const result = new Map(bays.map(bay => [String(bay._id), []]));
  const jobBookingIds = new Set();
  for (const job of jobs) {
    const bookingId = String(job.booking);
    const booking = bookingById.get(bookingId);
    jobBookingIds.add(bookingId);
    result.get(String(job.serviceBay))?.push({ jobOrderId: job._id, bookingId: job.booking,
      bookingStatus: booking?.status || null, vehiclePlate: booking?.vehicle?.plateNumber || null });
  }
  for (const booking of bookings) {
    if (jobBookingIds.has(String(booking._id))) continue;
    result.get(String(booking.assignedServiceBay))?.push({ bookingId: booking._id,
      bookingStatus: booking.status, vehiclePlate: booking.vehicle?.plateNumber || null });
  }
  return result;
}

async function describe(bays, session) {
  const assignments = await forBays(bays, session);
  return bays.map(bay => {
    const activeAssignments = assignments.get(String(bay._id)) || [];
    return { ...bay, availability: activeAssignments.length ? 'occupied' : 'available', activeAssignments };
  });
}

module.exports = { forBays, describe };
