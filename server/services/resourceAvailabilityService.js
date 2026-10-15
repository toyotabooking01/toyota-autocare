const Booking = require('../models/Booking');
const JobOrder = require('../models/JobOrder');
const ServiceBay = require('../models/ServiceBay');
const User = require('../models/User');

const activeBookingStatuses = ['pending', 'confirmed', 'checked_in', 'mechanic_assigned', 'in_service', 'final_inspection', 'ready_for_release'];
const activeJobStatuses = ['pending', 'in_progress'];
const minute = 60_000;

function calculateTotalDuration(services) {
  if (!Array.isArray(services) || services.length === 0) throw new TypeError('At least one Service is required.');
  return services.reduce((total, service) => {
    const duration = service?.estimatedDuration;
    if (!Number.isSafeInteger(duration) || duration < 1) throw new TypeError('Service duration must be a positive whole number of minutes.');
    const next = total + duration;
    if (!Number.isSafeInteger(next)) throw new TypeError('Total booking duration is too large.');
    return next;
  }, 0);
}

function intervalFor(date, timeSlot, durationMinutes) {
  if (!Number.isSafeInteger(durationMinutes) || durationMinutes < 1) throw new TypeError('Booking duration must be a positive whole number of minutes.');
  const startAt = new Date(`${date}T${timeSlot}:00+08:00`);
  const endAt = new Date(startAt.getTime() + durationMinutes * minute);
  if (Number.isNaN(startAt.getTime()) || manilaDate(endAt) !== date) return null;
  return { startAt, endAt };
}

function manilaDate(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function overlaps(left, right) {
  return left.startAt < right.endAt && left.endAt > right.startAt;
}

function reservationInterval(record, requested) {
  if (record.reservedStartAt instanceof Date && record.reservedEndAt instanceof Date
    && record.reservedEndAt > record.reservedStartAt) {
    return { startAt: record.reservedStartAt, endAt: record.reservedEndAt };
  }
  const booking = record.booking && typeof record.booking === 'object' ? record.booking : record;
  if (booking.reservedStartAt instanceof Date && booking.reservedEndAt instanceof Date
    && booking.reservedEndAt > booking.reservedStartAt) {
    return { startAt: booking.reservedStartAt, endAt: booking.reservedEndAt };
  }
  if (booking.bookingDate && booking.bookingTime && Array.isArray(booking.services) && booking.services.length) {
    try {
      const interval = intervalFor(booking.bookingDate, booking.bookingTime, calculateTotalDuration(booking.services));
      if (interval) return interval;
    } catch { /* Older incomplete records are treated as occupying their scheduled day. */ }
  }
  // If a legacy unfinished record has no usable duration, conservatively hold its day.
  const date = booking.bookingDate || requested.date;
  return { startAt: new Date(`${date}T00:00:00+08:00`), endAt: new Date(`${date}T23:59:59.999+08:00`) };
}

function resourceCapacity(resources, fixedReservations, genericReservations, period, usable) {
  const eligible = resources.filter(usable);
  const fixedForResource = new Map(eligible.map(item => [String(item._id), []]));
  for (const reservation of fixedReservations) {
    const key = String(reservation.resourceId || '');
    if (fixedForResource.has(key)) fixedForResource.get(key).push(reservation);
  }
  // A resource without a matching interval record but marked busy is conservatively excluded.
  const free = eligible.filter(item => {
    const busy = item.availability === 'busy' || item.availability === 'occupied';
    const intervals = fixedForResource.get(String(item._id));
    return !intervals.some(interval => overlaps(interval, period)) && !(busy && intervals.length === 0);
  });
  const untrackedBusyIds = eligible.filter(item => {
    const intervals = fixedForResource.get(String(item._id));
    return (item.availability === 'busy' || item.availability === 'occupied') && intervals.length === 0;
  }).map(item => String(item._id));
  const generic = genericReservations.filter(item => overlaps(item, period));
  const boundaries = [period.startAt.getTime(), period.endAt.getTime()];
  for (const reservation of [...fixedReservations, ...generic]) {
    if (!overlaps(reservation, period)) continue;
    boundaries.push(Math.max(period.startAt.getTime(), reservation.startAt.getTime()));
    boundaries.push(Math.min(period.endAt.getTime(), reservation.endAt.getTime()));
  }
  boundaries.sort((a, b) => a - b);
  let minimumFree = eligible.length;
  for (let index = 0; index < boundaries.length - 1; index++) {
    const start = boundaries[index]; const end = boundaries[index + 1];
    if (start === end) continue;
    const point = start + (end - start) / 2;
    const occupiedIds = new Set(fixedReservations.filter(item => item.startAt.getTime() <= point && item.endAt.getTime() > point)
      .map(item => String(item.resourceId || '')).filter(key => fixedForResource.has(key)));
    untrackedBusyIds.forEach(key => occupiedIds.add(key));
    const demand = generic.filter(item => item.startAt.getTime() <= point && item.endAt.getTime() > point).length;
    minimumFree = Math.min(minimumFree, eligible.length - occupiedIds.size - demand);
  }
  return { continuousResources: free.length, continuousResourceIds: free.map(item => String(item._id)),
    minimumFree: Math.max(0, minimumFree), available: free.length > 0 && minimumFree > 0 };
}

function assessAvailability({ mechanics = [], serviceBays = [], bookings = [], jobs = [] }, period) {
  const jobBookingIds = new Set(jobs.map(job => String(job.booking?._id || job.booking || '')));
  const fixedMechanics = [];
  const fixedBays = [];
  const genericMechanics = [];
  const genericBays = [];
  for (const booking of bookings) {
    const interval = reservationInterval(booking, period);
    const hasJob = jobBookingIds.has(String(booking._id));
    if (!hasJob && booking.assignedMechanic) fixedMechanics.push({ ...interval, resourceId: booking.assignedMechanic });
    if (!hasJob && booking.assignedServiceBay) fixedBays.push({ ...interval, resourceId: booking.assignedServiceBay });
    if (!hasJob && !booking.assignedMechanic) genericMechanics.push(interval);
    if (!hasJob && !booking.assignedServiceBay) genericBays.push(interval);
  }
  for (const job of jobs) {
    const interval = reservationInterval(job, period);
    fixedMechanics.push({ ...interval, resourceId: job.mechanic });
    fixedBays.push({ ...interval, resourceId: job.serviceBay });
  }
  const mechanicAvailability = resourceCapacity(mechanics, fixedMechanics, genericMechanics, period,
    item => item.role === 'mechanic' && item.status === 'active' && item.isArchived !== true && item.availability !== 'off_duty');
  const bayAvailability = resourceCapacity(serviceBays, fixedBays, genericBays, period,
    item => item.operationalStatus === 'operational' && item.isArchived !== true);
  return {
    available: mechanicAvailability.available && bayAvailability.available,
    mechanics: mechanicAvailability,
    serviceBays: bayAvailability,
  };
}

async function availabilityForPeriod(period, options = {}) {
  return (await availabilityForPeriods([period], options))[0];
}

async function availabilityForPeriods(periods, { session, excludeBookingId, allowBusyMechanicId, allowOccupiedBayId } = {}) {
  if (!periods.length) return [];
  const fromDate = manilaDate(periods.reduce((earliest, item) => item.startAt < earliest ? item.startAt : earliest, periods[0].startAt));
  const toDate = manilaDate(periods.reduce((latest, item) => item.startAt > latest ? item.startAt : latest, periods[0].startAt));
  const bookingQuery = Booking.find({ status: { $in: activeBookingStatuses }, bookingDate: { $gte: fromDate, $lte: toDate },
    ...(excludeBookingId ? { _id: { $ne: excludeBookingId } } : {}) })
    .select('_id bookingDate bookingTime services reservedStartAt reservedEndAt assignedMechanic assignedServiceBay status')
    .populate({ path: 'services', select: 'estimatedDuration' });
  const jobQuery = JobOrder.find({ status: { $in: activeJobStatuses }, ...(excludeBookingId ? { booking: { $ne: excludeBookingId } } : {}) })
    .select('booking mechanic serviceBay reservedStartAt reservedEndAt status')
    .populate({ path: 'booking', select: '_id bookingDate bookingTime services reservedStartAt reservedEndAt', populate: { path: 'services', select: 'estimatedDuration' } });
  const mechanicsQuery = User.find({ role: 'mechanic', status: 'active', isArchived: false, availability: { $in: ['available', 'busy'] } })
    .select('_id role status isArchived availability');
  const baysQuery = ServiceBay.find({ operationalStatus: 'operational', isArchived: false, availability: { $in: ['available', 'occupied'] } })
    .select('_id operationalStatus isArchived availability');
  for (const query of [bookingQuery, jobQuery, mechanicsQuery, baysQuery]) query.session(session);
  const [bookings, jobs, mechanics, serviceBays] = await Promise.all([
    bookingQuery.lean(), jobQuery.lean(), mechanicsQuery.lean(), baysQuery.lean(),
  ]);
  const normalizedMechanics = mechanics.map(item => String(item._id) === String(allowBusyMechanicId) ? { ...item, availability: 'available' } : item);
  const assignedBayIds = new Set([
    ...jobs.map(job => String(job.serviceBay || '')),
    ...bookings.map(booking => String(booking.assignedServiceBay || '')).filter(Boolean),
  ]);
  const normalizedBays = serviceBays.map(item =>
    String(item._id) === String(allowOccupiedBayId) || !assignedBayIds.has(String(item._id))
      ? { ...item, availability: 'available' } : item);
  const snapshot = { mechanics: normalizedMechanics, serviceBays: normalizedBays, bookings, jobs };
  return periods.map(period => assessAvailability(snapshot, period));
}

async function canFitBooking(period, options) {
  return availabilityForPeriod(period, options);
}

async function canFitAssignedResources(period, { session, excludeBookingId, mechanicId, serviceBayId } = {}) {
  const fit = await availabilityForPeriod(period, { session, excludeBookingId, allowBusyMechanicId: mechanicId, allowOccupiedBayId: serviceBayId });
  const mechanicFree = fit.mechanics.continuousResourceIds.includes(String(mechanicId)) && fit.mechanics.minimumFree > 0;
  const bayFree = fit.serviceBays.continuousResourceIds.includes(String(serviceBayId)) && fit.serviceBays.minimumFree > 0;
  return { available: mechanicFree && bayFree, mechanics: fit.mechanics, serviceBays: fit.serviceBays };
}

module.exports = { calculateTotalDuration, intervalFor, overlaps, assessAvailability, availabilityForPeriod, availabilityForPeriods, canFitBooking, canFitAssignedResources };
