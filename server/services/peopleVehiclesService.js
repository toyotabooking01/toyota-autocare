const validate = require('../utils/validateForm');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const temporaryPassword = require('../utils/temporaryPassword');
const User = require('../models/User');
const Counter = require('../models/Counter');
const Vehicle = require('../models/Vehicle');
const JobOrder = require('../models/JobOrder');
const Booking = require('../models/Booking');
const authValidation = require('../utils/authValidation');
const emailService = require('./emailService');
const { normalizeMobile } = require('../../shared/accountValidation.mjs');
const HttpError = require('../utils/HttpError');

const mechanicFields = ['fullName', 'email', 'phone', 'specialization', 'status', 'availability'];
const vehicleFields = ['make', 'model', 'year', 'plateNumber', 'transmission', 'currentMileage'];
const mechanicProjection = 'fullName email phone role employeeId specialization status availability emailVerified isArchived archivedAt createdAt updatedAt';
const availabilityValues = ['available', 'busy', 'off_duty'];
const unfinishedBookings = ['pending', 'confirmed', 'checked_in', 'mechanic_assigned', 'in_service', 'final_inspection', 'ready_for_release'];

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
  const body = object(raw, mechanicFields);
  validate('mechanic', body, { partial: !create,
    skip: create ? ['password', 'employeeId', ...['status', 'availability'].filter(field => !(field in body))] : [] });
  const data = {};
  if ('fullName' in body) data.fullName = requiredText(body.fullName, 'Full name', 120);
  else if (create) throw new HttpError(400, 'Full name is required.');
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
function vehicleInput(raw, create = false, clientForm = false) {
  const body = object(raw, vehicleFields);
  validate(clientForm ? 'clientVehicle' : 'vehicle', body, { partial: !create && !clientForm });
  const data = {};
  for (const field of ['make', 'model']) {
    if (field in body) data[field] = requiredText(body[field], field === 'make' ? 'Make' : 'Model', 80);
    else if (create) throw new HttpError(400, `${field} is required.`);
  }
  if ('year' in body) {
    const latestYear = new Date().getUTCFullYear() + (clientForm ? 0 : 1);
    if (!Number.isInteger(body.year) || body.year < 1886 || body.year > latestYear) throw new HttpError(400, 'Invalid vehicle year.');
    data.year = body.year;
  } else if (create) throw new HttpError(400, 'Year is required.');
  if ('plateNumber' in body) {
    const plate = requiredText(body.plateNumber, 'Plate number', 30).toUpperCase().replace(/[\s-]/g, '');
    if (!/^[A-Z0-9]{4,10}$/.test(plate)) throw new HttpError(400, 'Plate number must contain 4 to 10 letters or digits.');
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
    if (await User.exists(filter)) throw new HttpError(409, `${field === 'email' ? 'Email' : 'Employee ID'} already exists.`, { [field]: `${field === 'email' ? 'Email' : 'Employee ID'} already exists.` });
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
    const employeeId = `MECH-${String(counter.sequence).padStart(4, '0')}`;
    if (!await User.exists({ employeeId })) return employeeId;
  }
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
        mustChangePassword: true, status: data.status || 'active', availability: data.availability || 'available' });
    } catch (error) {
      if (error.code !== 11000) throw error;
      if (error.keyPattern?.employeeId || error.keyValue?.employeeId) continue;
      const duplicateEmail = error.keyPattern?.email || error.keyValue?.email;
      const message = duplicateEmail ? 'Email already exists.' : 'Mechanic details already exist.';
      throw new HttpError(409, message, { ...(duplicateEmail ? { email: message } : {}) });
    }
  }
  let emailSent = true;
  try { await emailService.sendTemporaryPassword({ email: data.email, password: secret, accountType: 'mechanic' }); }
  catch { emailSent = false; }
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
async function mechanicArchive(rawId, archived) {
  const id = recordId(rawId);
  const item = await User.findOne({ _id: id, role: 'mechanic' });
  if (!item) throw new HttpError(404, 'Mechanic not found.');
  if (item.isArchived !== archived) {
    if (archived) {
      const [job, booking] = await Promise.all([
        JobOrder.exists({ mechanic: id, status: { $in: ['pending', 'in_progress'] } }),
        Booking.exists({ assignedMechanic: id, status: { $in: unfinishedBookings } }),
      ]);
      if (job || booking) throw new HttpError(409, 'Mechanic has unfinished assigned work and cannot be archived.');
    }
    item.isArchived = archived;
    item.archivedAt = archived ? new Date() : null;
    if (archived) item.availability = 'off_duty';
    await item.save();
  }
  return mechanicGet(id);
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
async function checkPlate(plateNumber, excludeId) {
  if (plateNumber === undefined) return;
  const filter = { plateNumber };
  if (excludeId) filter._id = { $ne: excludeId };
  if (await Vehicle.exists(filter)) throw new HttpError(409, 'Plate number already exists.', { plateNumber: 'Plate number already exists.' });
}
async function vehicleCreate(ownerId, raw) {
  const data = vehicleInput(raw, true, true);
  await checkPlate(data.plateNumber);
  return Vehicle.create({ ...data, owner: ownerId });
}
async function vehicleUpdate(ownerId, rawId, raw) {
  const id = recordId(rawId);
  const data = vehicleInput(raw, false, true);
  const item = await ownVehicle(ownerId, id);
  if (item.isArchived) throw new HttpError(409, 'Restore vehicle before editing.');
  await checkPlate(data.plateNumber, id);
  Object.assign(item, data);
  return item.save();
}
async function vehicleArchive(ownerId, rawId, archived) {
  const item = await ownVehicle(ownerId, rawId);
  if (item.isArchived !== archived) {
    item.isArchived = archived;
    item.archivedAt = archived ? new Date() : null;
    await item.save();
  }
  return item;
}
module.exports = { mechanicInput, vehicleInput, mechanicList, mechanicGet, mechanicCreate, mechanicUpdate,
  mechanicArchive, vehicleList, vehicleGet, vehicleCreate, vehicleUpdate, vehicleArchive };
