const validate = require('../utils/validateForm');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const temporaryPassword = require('../utils/temporaryPassword');
const User = require('../models/User');
const Counter = require('../models/Counter');
const Vehicle = require('../models/Vehicle');
const authValidation = require('../utils/authValidation');
const emailService = require('./emailService');
const toyotaCatalog = require('./toyotaCatalogService');
const { normalizeMobile } = require('../../shared/accountValidation.cjs');
const HttpError = require('../utils/HttpError');
const { canonicalPlateNumber } = require('../../shared/accountValidation.cjs');
const { VEHICLE_YEAR_FLOOR, latestVehicleYear } = require('../../shared/vehicleYearRules.cjs');
const { duplicatePlateFilter, duplicatePlateError } = require('../utils/plateNumbers');

const mechanicFields = ['fullName', 'firstName', 'lastName', 'email', 'phone', 'specialization', 'status', 'availability'];
const mechanicCreationFields = ['firstName', 'lastName', 'email', 'phone'];
const vehicleFields = ['make', 'model', 'year', 'variant', 'plateNumber', 'transmission', 'currentMileage'];
const mechanicProjection = 'firstName lastName fullName email phone role employeeId specialization status availability emailVerified isArchived archivedAt createdAt updatedAt';
const availabilityValues = ['available', 'busy', 'off_duty'];

function object(raw, allowed) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Object.keys(raw).length
    || Object.keys(raw).some(field => !allowed.includes(field))) throw new HttpError(400, 'Invalid or unsupported fields.');
  return raw;
}
function recordId(raw) {
  if (!mongoose.isObjectIdOrHexString(raw)) throw new HttpError(400, 'Invalid record ID.');
  return raw;
}
function requiredText(value, label, max) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new HttpError(400, `${label} is required (up to ${max} characters).`);
  return value.trim();
}
function optionalText(value, label, max) {
  if (typeof value !== 'string' || value.trim().length > max) throw new HttpError(400, `${label} must be text (up to ${max} characters).`);
  return value.trim();
}
function mechanicInput(raw, create = false) {
  const body = object(raw, create ? mechanicCreationFields : mechanicFields);
  const named = create || 'firstName' in body || 'lastName' in body;
  validate(create ? 'mechanicCreate' : named ? 'mechanicNamedEdit' : 'mechanic', body, { partial: !create });
  const data = {};
  if (named) {
    if ('fullName' in body) throw new HttpError(400, 'Use first and last name fields.');
    data.firstName = requiredText(body.firstName, 'First name', 40).replace(/\s+/g, ' ');
    data.lastName = requiredText(body.lastName, 'Last name', 40).replace(/\s+/g, ' ');
    data.fullName = `${data.firstName} ${data.lastName}`;
  } else if ('fullName' in body) data.fullName = requiredText(body.fullName, 'Full name', 120);
  if ('email' in body) data.email = authValidation.email(body.email);
  else if (create) throw new HttpError(400, 'Email is required.');
  if ('phone' in body) {
    data.phone = normalizeMobile(requiredText(body.phone, 'Phone number', 20));
  } else if (create) throw new HttpError(400, 'Phone number is required.');
  if ('specialization' in body) {
    if (!Array.isArray(body.specialization) || body.specialization.length > 20) throw new HttpError(400, 'Invalid specializations.');
    data.specialization = body.specialization.map(value => requiredText(value, 'Specialization', 80));
  }
  if ('status' in body) {
    if (!['active', 'inactive'].includes(body.status)) throw new HttpError(400, 'Invalid mechanic status.');
    data.status = body.status;
  }
  if ('availability' in body) {
    if (!availabilityValues.includes(body.availability)) throw new HttpError(400, 'Invalid mechanic availability.');
    data.availability = body.availability;
  }
  return data;
}
function vehicleInput(raw, create = false, clientForm = false, { legacy = false, existingPlate } = {}) {
  const body = object(raw, vehicleFields);
  validate(clientForm ? 'clientVehicle' : 'vehicle', body, { partial: !create && !clientForm, skip: legacy ? ['variant'] : [], existingPlate: create ? undefined : existingPlate });
  const data = {};
  for (const field of ['make', 'model']) {
    if (field in body) data[field] = requiredText(body[field], field === 'make' ? 'Make' : 'Model', 80);
    else if (create) throw new HttpError(400, `${field} is required.`);
  }
  if (data.make && data.make.toLowerCase() !== 'toyota' && !legacy) throw new HttpError(400, 'Only Toyota vehicles are supported.', { make: 'Select Toyota.' });
  if (data.make?.toLowerCase() === 'toyota') data.make = 'Toyota';
  if (data.model) data.model = toyotaCatalog.normalizeModel(data.model);
  if (!legacy && (create || 'variant' in body) && (typeof body.variant !== 'string' || !body.variant.trim()))
    throw new HttpError(400, 'Variant is required.', { variant: 'Variant is required.' });
  if ('variant' in body || create) data.variant = body.variant?.trim()
    ? requiredText(body.variant, 'Variant', 120) : null;
  if ('year' in body) {
    const latestYear = latestVehicleYear(true);
    if (!Number.isInteger(body.year) || body.year < VEHICLE_YEAR_FLOOR || body.year > latestYear) throw new HttpError(400, 'Invalid vehicle year.');
    data.year = body.year;
  } else if (create) throw new HttpError(400, 'Year is required.');
  if ('plateNumber' in body) {
    const plate = canonicalPlateNumber(requiredText(body.plateNumber, 'Plate number', 30), { existingPlate: create ? undefined : existingPlate });
    if (!plate) throw new HttpError(400, 'Enter a valid Philippine plate number.', {
      plateNumber: 'Enter a valid Philippine plate number.',
    });
    data.plateNumber = plate;
  } else if (create) throw new HttpError(400, 'Plate number is required.');
  if ('transmission' in body) {
    if (!['manual', 'automatic', 'cvt'].includes(body.transmission)) throw new HttpError(400, 'Invalid transmission.');
    data.transmission = body.transmission;
  } else if (create) throw new HttpError(400, 'Transmission is required.');
  if ('currentMileage' in body) {
    if (!Number.isInteger(body.currentMileage) || body.currentMileage < 0) throw new HttpError(400, 'Mileage must be a non-negative whole number.');
    data.currentMileage = body.currentMileage;
  } else if (create && clientForm) {
    throw new HttpError(400, 'Current mileage is required.');
  }
  return data;
}
function archiveFilter(query) {
  const archive = query.archive || 'active';
  if (!['active', 'archived', 'all'].includes(archive)) throw new HttpError(400, 'Invalid archive filter.');
  return archive === 'all' ? {} : { isArchived: archive === 'archived' };
}
function searchFilter(raw) {
  if (raw === undefined || raw === '') return undefined;
  if (typeof raw !== 'string' || raw.length > 100) throw new HttpError(400, 'Invalid search.');
  return { $regex: raw.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
}
async function mechanicList(query) {
  const filter = { role: 'mechanic', ...archiveFilter(query) };
  const search = searchFilter(query.search);
  if (search) filter.$or = [{ fullName: search }, { email: search }, { employeeId: search }];
  if (query.status && query.status !== 'all') {
    if (!['active', 'inactive'].includes(query.status)) throw new HttpError(400, 'Invalid status filter.');
    filter.status = query.status;
  }
  if (query.availability && query.availability !== 'all') {
    if (!availabilityValues.includes(query.availability)) throw new HttpError(400, 'Invalid availability filter.');
    filter.availability = query.availability;
  }
  return require('../utils/pagination').listPage(User, filter, query, () => User.find(filter).select(mechanicProjection).sort({ fullName: 1, _id: 1 }));
}
async function mechanicGet(rawId) {
  const item = await User.findOne({ _id: recordId(rawId), role: 'mechanic' }).select(mechanicProjection).lean();
  if (!item) throw new HttpError(404, 'Mechanic not found.');
  return item;
}
async function checkMechanicDuplicates(data, excludeId) {
  for (const field of ['email']) {
    if (data[field] === undefined) continue;
    const filter = { [field]: data[field] };
    if (excludeId) filter._id = { $ne: excludeId };
    if (await User.exists(filter)) throw new HttpError(409, 'This email is already registered.', { email: 'This email is already registered.' });
  }
}
async function nextMechanicEmployeeId() {
  while (true) {
    let counter;
    try {
      counter = await Counter.findOneAndUpdate({ _id: 'mechanicEmployeeId' }, { $inc: { sequence: 1 } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: false });
    } catch (error) {
      // Concurrent first-time upserts can race on the counter's unique _id. Retry
      // against the counter that won so each caller receives a distinct number.
      if (error.code === 11000) continue;
      throw error;
    }
    if (!Number.isSafeInteger(counter.sequence) || counter.sequence < 1) throw new HttpError(503, 'Mechanic ID sequence is unavailable.');
    const employeeId = formatMechanicId(counter.sequence);
    if (!await User.exists({ employeeId })) return employeeId;
  }
}
function formatMechanicId(sequence) { return `MEC-${String(sequence).padStart(4, '0')}`; }
async function previewMechanicId() {
  const counter = await Counter.findById('mechanicEmployeeId').lean();
  let sequence = (counter?.sequence || 0) + 1;
  while (Number.isSafeInteger(sequence) && sequence > 0) {
    const employeeId = formatMechanicId(sequence);
    if (!await User.exists({ employeeId })) return employeeId;
    sequence++;
  }
  throw new HttpError(503, 'Mechanic ID sequence is unavailable.');
}
async function mechanicCreate(raw) {
  const data = mechanicInput(raw, true);
  await checkMechanicDuplicates(data);
  try { emailService.ensureConfigured(); }
  catch { throw new HttpError(503, 'Mechanic account email is unavailable. No account was created. Please try again later.'); }
  const secret = temporaryPassword();
  const password = await bcrypt.hash(secret, 12);
  let item;
  while (!item) {
    const employeeId = await nextMechanicEmployeeId();
    try {
      item = await User.create({ ...data, employeeId, password, role: 'mechanic', emailVerified: true,
        mustChangePassword: true, status: 'active', availability: 'available' });
    } catch (error) {
      if (error.code !== 11000) throw error;
      if (error.keyPattern?.employeeId || error.keyValue?.employeeId) continue;
      const duplicateEmail = error.keyPattern?.email || error.keyValue?.email;
      const message = duplicateEmail ? 'This email is already registered.' : 'Mechanic details already exist.';
      throw new HttpError(409, message, { ...(duplicateEmail ? { email: message } : {}) });
    }
  }
  let emailSent = true;
  try { await emailService.sendTemporaryPassword({ email: data.email, password: secret, accountType: 'mechanic', firstName: data.firstName, employeeId: item.employeeId }); }
  catch { emailSent = false; }
  await require('./engagementService').recordAccountEvent(item, 'created');
  return {
    item: await mechanicGet(String(item._id)),
    emailSent,
    message: emailSent
      ? 'Mechanic account created. Temporary sign-in details were sent to the mechanic’s email.'
      : 'Mechanic account created, but the sign-in email could not be sent. Do not create another account. Ask the mechanic to use Forgot password with this email when delivery is available.',
  };
}
async function mechanicUpdate(rawId, raw) {
  const id = recordId(rawId);
  if (!raw || !Object.hasOwn(raw, 'phone')) throw new HttpError(400, 'Phone number is required.', { phone: 'Phone number is required.' });
  const data = mechanicInput(raw);
  const item = await User.findOne({ _id: id, role: 'mechanic' });
  if (!item) throw new HttpError(404, 'Mechanic not found.');
  if (item.isArchived) throw new HttpError(409, 'Restore mechanic before editing.');
  await checkMechanicDuplicates(data, id);
  Object.assign(item, data);
  await item.save();
  return mechanicGet(id);
}
async function mechanicArchive(rawId, archived, actor, body = {}) {
  return require('./archiveService').user(rawId, archived, actor, body, 'mechanic');
}
async function vehicleList(ownerId, query) {
  const filter = { owner: ownerId, ...archiveFilter(query) };
  return Vehicle.find(filter).sort({ createdAt: -1 }).lean();
}
async function ownVehicle(ownerId, rawId) {
  const item = await Vehicle.findOne({ _id: recordId(rawId), owner: ownerId });
  if (!item) throw new HttpError(404, 'Vehicle not found.');
  return item;
}
async function vehicleGet(ownerId, rawId) { return ownVehicle(ownerId, rawId); }
async function checkPlate(plateNumber, excludeId, existingPlate) {
  if (plateNumber === undefined) return;
  if (await Vehicle.exists(duplicatePlateFilter(plateNumber, excludeId, { existingPlate }))) throw duplicatePlateError();
}
async function vehicleCreate(ownerId, raw) {
  const data = vehicleInput(raw, true, true);
  const entry = await toyotaCatalog.validateSelection(data);
  await checkPlate(data.plateNumber);
  return Vehicle.create({ ...data, owner: ownerId, catalogEntry: entry?._id || null });
}
async function vehicleUpdate(ownerId, rawId, raw) {
  const id = recordId(rawId);
  const item = await ownVehicle(ownerId, id);
  if (item.isArchived) throw new HttpError(409, 'Restore vehicle before editing.');
  const legacy = !item.variant && !raw?.variant && raw?.make === item.make && raw?.model === item.model && raw?.year === item.year;
  const data = vehicleInput(raw, false, true, { legacy, existingPlate: item.plateNumber });
  const identityUnchanged = data.make === item.make && data.model === item.model && data.year === item.year
    && data.variant === item.variant && data.transmission === item.transmission;
  if (!legacy && !identityUnchanged) {
    const entry = await toyotaCatalog.validateSelection(data);
    data.catalogEntry = entry?._id || null;
  }
  await checkPlate(data.plateNumber, id, item.plateNumber);
  item.$locals = { ...item.$locals, existingPlate: item.plateNumber };
  Object.assign(item, data);
  return item.save();
}
module.exports = { mechanicInput, vehicleInput, mechanicList, mechanicGet, mechanicCreate, mechanicUpdate, previewMechanicId, nextMechanicEmployeeId,
  mechanicArchive, vehicleList, vehicleGet, vehicleCreate, vehicleUpdate };
