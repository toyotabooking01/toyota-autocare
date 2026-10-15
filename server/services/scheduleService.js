const validate = require('../utils/validateForm');
const mongoose = require('mongoose');
const Schedule = require('../models/Schedule');
const Service = require('../models/Service');
const HttpError = require('../utils/HttpError');
const resources = require('./resourceAvailabilityService');
const holds = require('./bookingHoldService');

function id(value) {
  if (!mongoose.isObjectIdOrHexString(value)) throw new HttpError(400, 'Invalid schedule ID.');
  return value;
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, 'Use a valid YYYY-MM-DD date.', { date: 'Use a valid YYYY-MM-DD date.' });
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new HttpError(400, 'Use a valid YYYY-MM-DD date.', { date: 'Use a valid YYYY-MM-DD date.' });
  return value;
}
function time(value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new HttpError(400, 'Use a valid HH:MM time.', { timeSlot: 'Use a valid HH:MM time.' });
  return value;
}
function manilaNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, timeSlot: `${parts.hour}:${parts.minute}` };
}
function isFuture(slot) {
  const now = manilaNow();
  return `${slot.date}T${slot.timeSlot}` > `${now.date}T${now.timeSlot}`;
}
function input(raw, create = false) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Object.keys(raw).length
    || Object.keys(raw).some(key => !['date', 'timeSlot', 'maximumCapacity', 'openingTime', 'closingTime'].includes(key))) throw new HttpError(400, 'Invalid or unsupported schedule fields.');
  validate('schedule', raw, { partial: !create });
  const data = {};
  if ('date' in raw) data.date = date(raw.date);
  else if (create) throw new HttpError(400, 'Date is required.');
  if ('timeSlot' in raw) data.timeSlot = time(raw.timeSlot);
  else if (create) throw new HttpError(400, 'Time is required.');
  if ('maximumCapacity' in raw) {
    if (!Number.isInteger(raw.maximumCapacity) || raw.maximumCapacity < 1) throw new HttpError(400, 'Capacity must be a positive whole number.');
    data.maximumCapacity = raw.maximumCapacity;
  } else if (create) throw new HttpError(400, 'Capacity is required.');
  if ('openingTime' in raw) data.openingTime = time(raw.openingTime);
  if ('closingTime' in raw) data.closingTime = time(raw.closingTime);
  if ((data.openingTime && !data.closingTime) || (!data.openingTime && data.closingTime)) {
    throw new HttpError(400, 'Provide both opening and closing times.', { closingTime: 'Provide both opening and closing times.' });
  }
  if (data.openingTime && data.closingTime && data.closingTime <= data.openingTime) {
    throw new HttpError(400, 'Closing time must be later than opening time.', { closingTime: 'Closing time must be later than opening time.' });
  }
  if (data.openingTime && data.timeSlot && (data.timeSlot < data.openingTime || data.timeSlot >= data.closingTime)) {
    throw new HttpError(400, 'Appointment time must fall within working hours.', { timeSlot: 'Appointment time must fall within working hours.' });
  }
  return data;
}
function filters(query) {
  const filter = {};
  if (query.date) filter.date = date(query.date);
  if (query.enabled && query.enabled !== 'all') {
    if (!['true', 'false'].includes(query.enabled)) throw new HttpError(400, 'Invalid enabled filter.');
    filter.isEnabled = query.enabled === 'true';
  }
  if (query.search) {
    if (typeof query.search !== 'string' || query.search.length > 100) throw new HttpError(400, 'Invalid search.');
    const escaped = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ date: { $regex: escaped } }, { timeSlot: { $regex: escaped } }];
  }
  return filter;
}
async function list(query) {
  const filter = filters(query);
  return require('../utils/pagination').listPage(Schedule, filter, query, () => Schedule.find(filter).sort({ date: 1, timeSlot: 1, _id: 1 }));
}
async function available() {
  const now = manilaNow();
  await holds.releaseExpired({ bookingDate: { $gte: now.date } });
  const slots = await Schedule.find({ isEnabled: true, date: { $gte: now.date },
    $expr: holds.capacityAvailable })
    .sort({ date: 1, timeSlot: 1 }).lean();
  return slots.filter(isFuture);
}
function withinWorkingHours(slot, period) {
  if (!slot.openingTime && !slot.closingTime) return true; // Legacy schedules had no working-hours fields.
  if (!slot.openingTime || !slot.closingTime || slot.timeSlot < slot.openingTime || slot.timeSlot >= slot.closingTime) return false;
  const closeAt = new Date(`${slot.date}T${slot.closingTime}:00+08:00`);
  return period.endAt <= closeAt;
}
function timePlusMinutes(dateValue, timeValue, minutes) {
  const start = new Date(`${dateValue}T${timeValue}:00+08:00`);
  const end = new Date(start.getTime() + minutes * 60_000);
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(end);
}
async function availability({ serviceIds, fromDate, toDate }) {
  if (!Array.isArray(serviceIds) || serviceIds.length < 1 || serviceIds.length > 20
    || serviceIds.some(value => !mongoose.isObjectIdOrHexString(value)) || new Set(serviceIds).size !== serviceIds.length) {
    throw new HttpError(400, 'Select valid services.', { services: 'Select valid services.' });
  }
  const from = date(fromDate); const to = date(toDate);
  if (to < from || (new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86_400_000 > 61) {
    throw new HttpError(400, 'Choose a date range within two months.', { date: 'Choose a date range within two months.' });
  }
  const services = await Service.find({ _id: { $in: serviceIds }, isActive: true, isArchived: false }).select('_id estimatedDuration').lean();
  if (services.length !== serviceIds.length) throw new HttpError(400, 'One or more services are unavailable.', { services: 'One or more services are unavailable.' });
  let durationMinutes;
  try { durationMinutes = resources.calculateTotalDuration(services); }
  catch { throw new HttpError(409, 'Selected services do not have valid durations.', { services: 'Please choose services with valid durations.' }); }
  await holds.releaseExpired({ bookingDate: { $gte: from, $lte: to } });
  const schedules = await Schedule.find({ isEnabled: true, date: { $gte: from, $lte: to } })
    .sort({ date: 1, timeSlot: 1 }).lean();
  const candidates = schedules.map(slot => ({ slot, period: resources.intervalFor(slot.date, slot.timeSlot, durationMinutes) }))
    .filter(({ slot, period }) => period && isFuture(slot) && withinWorkingHours(slot, period));
  const fits = await resources.availabilityForPeriods(candidates.map(item => item.period));
  const byDate = new Map();
  candidates.forEach(({ slot, period }, index) => {
    const fit = fits[index];
    const capacityRemaining = slot.currentBookingCount + (slot.temporaryHoldCount || 0) < slot.maximumCapacity;
    const available = capacityRemaining && fit.available;
    const dateSlots = byDate.get(slot.date) || [];
    dateSlots.push({ scheduleId: slot._id, time: slot.timeSlot,
      estimatedEndTime: timePlusMinutes(slot.date, slot.timeSlot, durationMinutes),
      available, mechanicCount: fit.mechanics.minimumFree, serviceBayCount: fit.serviceBays.minimumFree,
      ...(available ? {} : { unavailableLabel: capacityRemaining ? 'Unavailable' : 'Fully booked' }) });
    byDate.set(slot.date, dateSlots);
  });
  const dates = [];
  for (let cursor = new Date(`${from}T00:00:00.000Z`); cursor <= new Date(`${to}T00:00:00.000Z`); cursor = new Date(cursor.getTime() + 86_400_000)) {
    const day = cursor.toISOString().slice(0, 10);
    const slots = byDate.get(day) || [];
    dates.push({ date: day, available: slots.some(slot => slot.available), slots });
  }
  return { dates };
}
async function get(rawId) {
  const slot = await Schedule.findById(id(rawId)).lean();
  if (!slot) throw new HttpError(404, 'Schedule not found.');
  return slot;
}
async function create(raw) {
  const data = input(raw, true);
  if (!isFuture(data)) throw new HttpError(400, 'Schedule must be in the future.', { timeSlot: 'Schedule must be in the future.' });
  return Schedule.create(data);
}
function generatorInput(raw) {
  const allowed = ['startDate', 'endDate', 'workingDays', 'openingTime', 'closingTime', 'slotIntervalMinutes', 'maximumCapacity'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !allowed.includes(key))) throw new HttpError(400, 'Invalid schedule generator settings.');
  const startDate = date(raw.startDate); const endDate = date(raw.endDate);
  const today = manilaNow().date;
  if (startDate < today || endDate < startDate) throw new HttpError(400, 'Choose a future date range.', { startDate: 'Choose a valid future date range.' });
  if ((new Date(`${endDate}T00:00:00Z`) - new Date(`${startDate}T00:00:00Z`)) / 86_400_000 > 365) throw new HttpError(400, 'Choose a date range within one year.');
  if (!Array.isArray(raw.workingDays) || !raw.workingDays.length || raw.workingDays.some(day => !Number.isInteger(day) || day < 0 || day > 6)
    || new Set(raw.workingDays).size !== raw.workingDays.length) throw new HttpError(400, 'Choose at least one valid working day.', { workingDays: 'Choose at least one working day.' });
  const openingTime = time(raw.openingTime); const closingTime = time(raw.closingTime);
  if (closingTime <= openingTime) throw new HttpError(400, 'Closing time must be later than opening time.', { closingTime: 'Closing time must be later than opening time.' });
  if (!Number.isInteger(raw.slotIntervalMinutes) || raw.slotIntervalMinutes < 15 || raw.slotIntervalMinutes > 240) throw new HttpError(400, 'Slot interval must be 15 to 240 minutes.', { slotIntervalMinutes: 'Choose an interval from 15 to 240 minutes.' });
  if (!Number.isInteger(raw.maximumCapacity) || raw.maximumCapacity < 1 || raw.maximumCapacity > 1000) throw new HttpError(400, 'Capacity must be a positive whole number.', { maximumCapacity: 'Enter a valid capacity.' });
  return { startDate, endDate, workingDays: raw.workingDays, openingTime, closingTime,
    slotIntervalMinutes: raw.slotIntervalMinutes, maximumCapacity: raw.maximumCapacity };
}
async function generate(raw) {
  const settings = generatorInput(raw);
  const operations = [];
  for (let cursor = new Date(`${settings.startDate}T00:00:00.000Z`); cursor <= new Date(`${settings.endDate}T00:00:00.000Z`); cursor = new Date(cursor.getTime() + 86_400_000)) {
    const dateValue = cursor.toISOString().slice(0, 10);
    if (!settings.workingDays.includes(cursor.getUTCDay())) continue;
    const [openHour, openMinute] = settings.openingTime.split(':').map(Number);
    const [closeHour, closeMinute] = settings.closingTime.split(':').map(Number);
    const opening = openHour * 60 + openMinute; const closing = closeHour * 60 + closeMinute;
    for (let offset = opening; offset < closing; offset += settings.slotIntervalMinutes) {
      const timeSlot = `${String(Math.floor(offset / 60)).padStart(2, '0')}:${String(offset % 60).padStart(2, '0')}`;
      if (!isFuture({ date: dateValue, timeSlot })) continue;
      operations.push({ updateOne: { filter: { date: dateValue, timeSlot }, update: { $setOnInsert: {
        date: dateValue, timeSlot, openingTime: settings.openingTime, closingTime: settings.closingTime,
        maximumCapacity: settings.maximumCapacity, currentBookingCount: 0, temporaryHoldCount: 0, isEnabled: true,
      } }, upsert: true } });
      if (operations.length > 5000) throw new HttpError(400, 'This range creates too many slots. Shorten the date range or use a wider interval.');
    }
  }
  if (!operations.length) throw new HttpError(400, 'No slots match the selected working days and hours.');
  try {
    const result = await Schedule.bulkWrite(operations, { ordered: false });
    return { generatedCount: result.upsertedCount || 0, existingCount: operations.length - (result.upsertedCount || 0), totalSlots: operations.length };
  } catch (error) {
    if (error.code === 11000 || error.writeErrors?.every(item => item.code === 11000)) {
      const generatedCount = error.result?.upsertedCount || error.result?.getUpsertedIds?.().length || 0;
      return { generatedCount, existingCount: operations.length - generatedCount, totalSlots: operations.length };
    }
    throw error;
  }
}
async function update(rawId, raw) {
  const slotId = id(rawId);
  await holds.releaseExpired({ schedule: slotId });
  const data = input(raw);
  const existing = await Schedule.findById(slotId).lean();
  if (!existing) throw new HttpError(404, 'Schedule not found.');
  if (!isFuture(existing)) throw new HttpError(409, 'Past schedules cannot be edited.');
  const proposed = { ...existing, ...data };
  if (!isFuture(proposed)) throw new HttpError(400, 'Schedule must be in the future.', { timeSlot: 'Schedule must be in the future.' });
  const occupied = existing.currentBookingCount + (existing.temporaryHoldCount || 0);
  if (occupied > 0 && (proposed.date !== existing.date || proposed.timeSlot !== existing.timeSlot)) {
    throw new HttpError(409, 'A reserved schedule cannot change date or time.', { timeSlot: 'A reserved schedule cannot change date or time.' });
  }
  if (occupied > 0 && (proposed.openingTime !== existing.openingTime || proposed.closingTime !== existing.closingTime)) {
    throw new HttpError(409, 'Working hours cannot change while bookings are reserved.', { closingTime: 'Working hours cannot change while bookings are reserved.' });
  }
  // The booked-count predicate protects this update against a concurrent reservation.
  const changed = await Schedule.findOneAndUpdate({ _id: slotId,
    $expr: holds.capacityWithin(proposed.maximumCapacity),
    ...(occupied > 0 ? { date: existing.date, timeSlot: existing.timeSlot } : { currentBookingCount: 0, temporaryHoldCount: { $in: [0, null] } }),
  }, { $set: data }, { returnDocument: 'after', runValidators: true });
  if (!changed) throw new HttpError(409, 'Schedule changed or capacity is below current reservations. Please refresh.', { maximumCapacity: 'Schedule changed or capacity is below current reservations. Please refresh.' });
  return changed;
}
async function setEnabled(rawId, raw) {
  const slotId = id(rawId);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== 1 || typeof raw.isEnabled !== 'boolean') {
    throw new HttpError(400, 'Provide isEnabled as true or false.');
  }
  const filter = { _id: slotId };
  if (raw.isEnabled) {
    const now = manilaNow();
    filter.$or = [{ date: { $gt: now.date } }, { date: now.date, timeSlot: { $gt: now.timeSlot } }];
  }
  const slot = await Schedule.findOneAndUpdate(filter, { $set: { isEnabled: raw.isEnabled } }, { returnDocument: 'after' });
  if (!slot) {
    if (!await Schedule.exists({ _id: slotId })) throw new HttpError(404, 'Schedule not found.');
    throw new HttpError(409, 'Schedule is unavailable or cannot be enabled in the past.');
  }
  return slot;
}
module.exports = { input, date, time, manilaNow, isFuture, withinWorkingHours, list, available, availability, generatorInput, generate, get, create, update, setEnabled };
