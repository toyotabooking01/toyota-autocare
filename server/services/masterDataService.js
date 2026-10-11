const validate = require('../utils/validateForm');
const mongoose = require('mongoose');
const Service = require('../models/Service');
const ServiceBay = require('../models/ServiceBay');
const JobOrder = require('../models/JobOrder');
const Booking = require('../models/Booking');
const HttpError = require('../utils/HttpError');
const { normalizeServiceBayName, SERVICE_BAY_DUPLICATE } = require('../../shared/serviceBayName.mjs');

const settings = {
  service: { Model: Service, fields: ['name', 'description', 'estimatedDuration', 'estimatedPrice', 'maintenanceReminderInterval', 'isActive', 'checklistTemplate'] },
  bay: { Model: ServiceBay, fields: ['name', 'operationalStatus'] },
};
const bayStatuses = ['operational', 'maintenance', 'out_of_service'];
const unfinishedBookingStatuses = ['pending', 'confirmed', 'checked_in', 'mechanic_assigned', 'in_service', 'final_inspection', 'ready_for_release'];
function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function config(kind) { return settings[kind]; }
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'A JSON object is required.');
  return value;
}
function id(value) {
  if (!mongoose.isObjectIdOrHexString(value)) throw new HttpError(400, 'Invalid record ID.');
  return value;
}
function text(value, field, max, required = false) {
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be text.`);
  const cleaned = value.trim();
  if ((required && !cleaned) || cleaned.length > max) throw new HttpError(400, `${field} must be ${required ? 'nonempty and ' : ''}at most ${max} characters.`);
  return cleaned;
}
function positiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) throw new HttpError(400, `${field} must be a positive whole number.`);
  return value;
}
function input(kind, raw, create = false) {
  const body = object(raw);
  const { fields } = config(kind);
  if (!Object.keys(body).length || Object.keys(body).some(key => !fields.includes(key))) throw new HttpError(400, 'Invalid or unsupported fields.');
  validate(kind, body, { partial: !create, skip: 'operationalStatus' in body ? [] : ['operationalStatus'] });
  const data = {};
  if ('name' in body) data.name = text(body.name, 'Name', kind === 'service' ? 120 : 80, true);
  else if (create) throw new HttpError(400, 'Name is required.');
  if (kind === 'service') {
    if ('description' in body) data.description = text(body.description, 'Description', 3000);
    if ('estimatedDuration' in body) data.estimatedDuration = positiveInteger(body.estimatedDuration, 'Estimated duration');
    else if (create) throw new HttpError(400, 'Estimated duration is required.');
    if ('estimatedPrice' in body) {
      if (typeof body.estimatedPrice !== 'number' || !Number.isFinite(body.estimatedPrice) || body.estimatedPrice < 0) throw new HttpError(400, 'Estimated price must be non-negative.');
      data.estimatedPrice = body.estimatedPrice;
    } else if (create) throw new HttpError(400, 'Estimated price is required.');
    if ('maintenanceReminderInterval' in body) data.maintenanceReminderInterval = body.maintenanceReminderInterval === null ? null : positiveInteger(body.maintenanceReminderInterval, 'Reminder interval');
    if ('isActive' in body) {
      if (typeof body.isActive !== 'boolean') throw new HttpError(400, 'Active must be true or false.');
      data.isActive = body.isActive;
    }
    if ('checklistTemplate' in body) {
      if (!Array.isArray(body.checklistTemplate) || body.checklistTemplate.length > 10) {
        throw new HttpError(400, 'A Service checklist can contain up to 10 items.', { checklistTemplate: 'Use no more than 10 checklist items.' });
      }
      const items = body.checklistTemplate.map(item => typeof item === 'string' ? item.trim() : '');
      if (items.some(item => !item || item.length > 500)) {
        throw new HttpError(400, 'Checklist items must contain 1 to 500 characters.', { checklistTemplate: 'Each checklist item must contain 1 to 500 characters.' });
      }
      if (new Set(items.map(item => item.toLocaleLowerCase())).size !== items.length) {
        throw new HttpError(400, 'Checklist items must be unique.', { checklistTemplate: 'Remove duplicate checklist items.' });
      }
      data.checklistTemplate = items;
    }
  } else if ('operationalStatus' in body) {
    if (!bayStatuses.includes(body.operationalStatus)) throw new HttpError(400, 'Invalid operational status.');
    data.operationalStatus = body.operationalStatus;
  }
  return data;
}

async function uniqueServiceName(name, excludeId) {
  // Existing catalogs may contain duplicate names, so do not add a new global index.
  const filter = { name: { $regex: `^${escapeRegex(name.trim())}$`, $options: 'i' } };
  if (excludeId) filter._id = { $ne: excludeId };
  if (await Service.exists(filter)) throw new HttpError(409, 'A service with this name already exists.', { name: 'A service with this name already exists.' });
}
async function bayNameAvailability(query) {
  const name = normalizeServiceBayName(text(query.name, 'Name', 80, true));
  if (name.length > 80) throw new HttpError(400, 'Name must be at most 80 characters.');
  const filter = { name };
  if (query.excludeId !== undefined) filter._id = { $ne: id(query.excludeId) };
  // Archived names remain reserved by the existing unique index.
  return { exists: Boolean(await ServiceBay.exists(filter)) };
}
function bayDuplicate() { return new HttpError(409, SERVICE_BAY_DUPLICATE, { name: SERVICE_BAY_DUPLICATE }); }
async function uniqueBayName(name, excludeId) {
  if ((await bayNameAvailability({ name, ...(excludeId ? { excludeId } : {}) })).exists) throw bayDuplicate();
}
async function saveBay(write) {
  try { return await write(); }
  catch (error) { if (error.code === 11000) throw bayDuplicate(); throw error; }
}
async function list(kind, query) {
  const { Model } = config(kind);
  const filter = {};
  const archive = query.archive || 'active';
  if (!['active', 'archived', 'all'].includes(archive)) throw new HttpError(400, 'Invalid archive filter.');
  if (archive !== 'all') filter.isArchived = archive === 'archived';
  if (query.search !== undefined) {
    const search = text(query.search, 'Search', 100);
    if (search) filter.name = { $regex: escapeRegex(search), $options: 'i' };
  }
  if (kind === 'service' && query.status && query.status !== 'all') {
    if (!['active', 'inactive'].includes(query.status)) throw new HttpError(400, 'Invalid status filter.');
    filter.isActive = query.status === 'active';
  }
  if (kind === 'bay' && query.status && query.status !== 'all') {
    if (!bayStatuses.includes(query.status)) throw new HttpError(400, 'Invalid status filter.');
    filter.operationalStatus = query.status;
  }
  return require('../utils/pagination').listPage(Model, filter, query, () => Model.find(filter).sort({ name: 1, _id: 1 }));
}
async function get(kind, rawId) {
  const item = await config(kind).Model.findById(id(rawId)).lean();
  if (!item) throw new HttpError(404, 'Record not found.');
  return item;
}
async function create(kind, body) {
  const data = input(kind, body, true);
  if (kind === 'service') await uniqueServiceName(data.name);
  if (kind === 'bay') {
    data.name = normalizeServiceBayName(data.name);
    await uniqueBayName(data.name);
    return saveBay(() => ServiceBay.create(data));
  }
  return config(kind).Model.create(data);
}
async function update(kind, rawId, body) {
  const recordId = id(rawId);
  const data = input(kind, body);
  const item = await config(kind).Model.findById(recordId);
  if (!item) throw new HttpError(404, 'Record not found.');
  if (item.isArchived) throw new HttpError(409, 'Restore this record before editing it.');
  if (kind === 'service' && item.isOtherService
    && ((data.name !== undefined && data.name.toLowerCase() !== 'other') || data.isActive === false)) {
    throw new HttpError(400, 'The Other diagnostic service must remain available with its standard name.');
  }
  if (kind === 'service' && data.name !== undefined && data.name.toLowerCase() !== item.name.toLowerCase()) await uniqueServiceName(data.name, recordId);
  if (kind === 'bay' && data.name !== undefined) {
    data.name = normalizeServiceBayName(data.name);
    await uniqueBayName(data.name, recordId);
  }
  Object.assign(item, data);
  if (kind === 'bay') return saveBay(() => item.save());
  return item.save();
}
async function setArchive(kind, rawId, archived) {
  const recordId = id(rawId);
  const { Model } = config(kind);
  const item = await Model.findById(recordId);
  if (!item) throw new HttpError(404, 'Record not found.');
  if (item.isArchived === archived) return item;
  if (kind === 'service' && item.isOtherService && archived) throw new HttpError(409, 'The Other diagnostic service must remain available.');
  if (kind === 'bay' && archived) {
    const [job, booking] = await Promise.all([
      JobOrder.exists({ serviceBay: recordId, status: { $in: ['pending', 'in_progress'] } }),
      Booking.exists({ assignedServiceBay: recordId, status: { $in: unfinishedBookingStatuses } }),
    ]);
    if (job || booking) throw new HttpError(409, 'Bay is assigned to unfinished work and cannot be archived.');
  }
  item.isArchived = archived;
  item.archivedAt = archived ? new Date() : null;
  return item.save();
}
module.exports = { input, list, get, create, update, setArchive, bayNameAvailability };
