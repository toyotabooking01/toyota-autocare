const mongoose = require('mongoose');
const Schedule = require('../models/Schedule');
const HttpError = require('../utils/HttpError');

function id(value) {
  if (!mongoose.isObjectIdOrHexString(value)) throw new HttpError(400, 'Invalid schedule ID.');
  return value;
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, 'Use a valid YYYY-MM-DD date.');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new HttpError(400, 'Use a valid YYYY-MM-DD date.');
  return value;
}
function time(value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new HttpError(400, 'Use a valid HH:MM time.');
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
    || Object.keys(raw).some(key => !['date', 'timeSlot', 'maximumCapacity'].includes(key))) throw new HttpError(400, 'Invalid or unsupported schedule fields.');
  const data = {};
  if ('date' in raw) data.date = date(raw.date);
  else if (create) throw new HttpError(400, 'Date is required.');
  if ('timeSlot' in raw) data.timeSlot = time(raw.timeSlot);
  else if (create) throw new HttpError(400, 'Time is required.');
  if ('maximumCapacity' in raw) {
    if (!Number.isInteger(raw.maximumCapacity) || raw.maximumCapacity < 1) throw new HttpError(400, 'Capacity must be a positive whole number.');
    data.maximumCapacity = raw.maximumCapacity;
  } else if (create) throw new HttpError(400, 'Capacity is required.');
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
  return Schedule.find(filters(query)).sort({ date: 1, timeSlot: 1 }).lean();
}
async function available() {
  const now = manilaNow();
  const slots = await Schedule.find({ isEnabled: true, date: { $gte: now.date },
    $expr: { $lt: ['$currentBookingCount', '$maximumCapacity'] } })
    .sort({ date: 1, timeSlot: 1 }).lean();
  return slots.filter(isFuture);
}
async function get(rawId) {
  const slot = await Schedule.findById(id(rawId)).lean();
  if (!slot) throw new HttpError(404, 'Schedule not found.');
  return slot;
}
async function create(raw) {
  const data = input(raw, true);
  if (!isFuture(data)) throw new HttpError(400, 'Schedule must be in the future.');
  return Schedule.create(data);
}
async function update(rawId, raw) {
  const slotId = id(rawId);
  const data = input(raw);
  const existing = await Schedule.findById(slotId).lean();
  if (!existing) throw new HttpError(404, 'Schedule not found.');
  if (!isFuture(existing)) throw new HttpError(409, 'Past schedules cannot be edited.');
  const proposed = { ...existing, ...data };
  if (!isFuture(proposed)) throw new HttpError(400, 'Schedule must be in the future.');
  if (existing.currentBookingCount > 0 && (proposed.date !== existing.date || proposed.timeSlot !== existing.timeSlot)) {
    throw new HttpError(409, 'A reserved schedule cannot change date or time.');
  }
  // The booked-count predicate protects this update against a concurrent reservation.
  const changed = await Schedule.findOneAndUpdate({ _id: slotId,
    currentBookingCount: { $lte: proposed.maximumCapacity },
    ...(existing.currentBookingCount > 0 ? { date: existing.date, timeSlot: existing.timeSlot } : { currentBookingCount: 0 }),
  }, { $set: data }, { returnDocument: 'after', runValidators: true });
  if (!changed) throw new HttpError(409, 'Schedule changed or capacity is below current reservations. Please refresh.');
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
module.exports = { input, date, time, manilaNow, isFuture, list, available, get, create, update, setEnabled };
