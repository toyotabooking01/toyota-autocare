const mongoose = require('mongoose');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const HttpError = require('../utils/HttpError');
const { duplicatePlateFilter, duplicatePlateError, duplicateMessage } = require('../utils/plateNumbers');
const validate = require('../utils/validateForm');
const authValidation = require('../utils/authValidation');
const { registrationNames, normalizeMobile } = require('../../shared/accountValidation.cjs');
const { vehicleInput } = require('./peopleVehiclesService');
const toyotaCatalog = require('./toyotaCatalogService');
const bookings = require('./bookingService');
const holds = require('./bookingHoldService');
const bcrypt = require('bcrypt');
const temporaryPassword = require('../utils/temporaryPassword');
const credentialDelivery = require('./clientCredentialDeliveryService');
const { identity } = require('../utils/operationalActor');

async function matchEmail(email, session) {
  const query = filter => {
    const lookup = User.findOne(filter).select('fullName email contactEmail role status isArchived isWalkInCustomer');
    return session ? lookup.session(session) : lookup;
  };
  // Prefer an existing login identity when an old contact record shares its email.
  const user = await query({ email }) || await query({ contactEmail: email });
  if (user && (user.role !== 'client' || user.status !== 'active' || user.isArchived)) {
    const message = user.role !== 'client' ? 'This email belongs to a non-client account.' : 'This customer account is inactive or archived. Choose another eligible customer.';
    throw new HttpError(409, message, { email: message });
  }
  return user;
}
async function checkEmail(rawEmail) {
  const email = authValidation.email(rawEmail);
  const user = await matchEmail(email);
  return { existingClient: Boolean(user && !user.isWalkInCustomer), existingCustomer: Boolean(user),
    account: user && !user.isWalkInCustomer ? { id: String(user._id), fullName: user.fullName, email: user.email } : null,
    message: user ? user.isWalkInCustomer ? 'Existing walk-in contact found. Create a Client account to continue.' : 'Existing client account found.' : '' };
}

async function provision(raw, actor) {
  authValidation.body(raw);
  if (Object.keys(raw).some(key => !['firstName', 'lastName', 'middleName', 'suffix', 'email', 'phone', 'address'].includes(key))) {
    throw new HttpError(400, 'Please check the customer information.');
  }
  validate('walkInClient', raw);
  const email = authValidation.email(raw.email);
  const names = registrationNames(raw);
  const phone = normalizeMobile(raw.phone);
  const address = raw.address?.trim() || '';
  let result;
  for (let attempt = 0; !result; attempt++) {
    try {
      result = await mongoose.connection.transaction(async session => {
        const matched = await matchEmail(email, session);
        if (matched && !matched.isWalkInCustomer) return { user: matched, accountCreated: false };
        const secret = temporaryPassword();
        const password = await bcrypt.hash(secret, 12);
        const grant = credentialDelivery.issueGrant(identity(actor).id);
        let user;
        if (matched) {
          user = await User.findOneAndUpdate({ _id: matched._id, isWalkInCustomer: true, status: 'active', isArchived: false },
            { $set: { ...names, phone, address, email, password, isWalkInCustomer: false,
              emailVerified: true, mustChangePassword: true, credentialDelivery: grant.metadata },
              $unset: { contactEmail: 1 }, $inc: { authVersion: 1 } },
            { session, returnDocument: 'after', runValidators: true }).select('fullName email');
          if (!user) throw new HttpError(409, 'This customer changed. Check the email and retry.');
        } else {
          [user] = await User.create([{ ...names, email, phone, address, role: 'client', status: 'active',
            password, isWalkInCustomer: false, emailVerified: true, mustChangePassword: true,
            credentialDelivery: grant.metadata }], { session });
        }
        return { user, accountCreated: true, secret, deliveryToken: grant.token };
      });
    } catch (error) {
      if (error.code === 11000 && (error.keyPattern?.email || error.keyValue?.email || error.keyPattern?.contactEmail || error.keyValue?.contactEmail) && attempt < 2) continue;
      if (error.code === 11000) throw new HttpError(409, 'This email could not be linked. Check the email and retry.', { email: 'This email could not be linked.' });
      throw error;
    }
  }
  const delivery = result.accountCreated ? await credentialDelivery.send(email, result.secret) : null;
  return { account: { id: String(result.user._id), fullName: result.user.fullName, email: result.user.email },
    accountCreated: result.accountCreated, existingClient: !result.accountCreated,
    ...(result.accountCreated ? { deliveryToken: result.deliveryToken, emailSent: delivery.emailSent } : {}) };
}

async function createVisit(raw, actor) {
  authValidation.body(raw);
  if (Object.keys(raw).some(key => !['client', 'vehicle', 'services', 'schedule', 'concern'].includes(key))) {
    throw new HttpError(400, 'Please check the walk-in information.');
  }
  if (!mongoose.isObjectIdOrHexString(raw.client)) throw new HttpError(400, 'Select a Client account.', { client: 'Select a Client account.' });
  const vehicle = vehicleInput(raw.vehicle, true);
  const catalogEntry = await toyotaCatalog.validateSelection(vehicle);
  const vehicleId = new mongoose.Types.ObjectId();
  const data = bookings.input({ vehicle: String(vehicleId), services: raw.services, schedule: raw.schedule, concern: raw.concern });
  await holds.releaseExpired({ schedule: data.schedule });
  if (await Vehicle.exists(duplicatePlateFilter(vehicle.plateNumber))) throw duplicatePlateError();
  try {
    const bookingId = await mongoose.connection.transaction(async session => {
      const client = await User.exists({ _id: raw.client, role: 'client', status: 'active', isArchived: false,
        isWalkInCustomer: false }).session(session);
      if (!client) throw new HttpError(409, 'A Client account is required before creating this visit.');
      await Vehicle.create([{ ...vehicle, _id: vehicleId, owner: raw.client, catalogEntry: catalogEntry?._id || null }], { session });
      return bookings.reserveBooking(session, raw.client, data, 'walk-in', actor);
    });
    return { item: await bookings.get(bookingId) };
  } catch (error) {
    if (error.code === 11000) throw duplicatePlateError();
    throw error;
  }
}
async function create(raw, staffId) {
  const operator = identity(staffId);
  authValidation.body(raw);
  if (Object.keys(raw).some(key => !['customer', 'vehicle', 'services', 'schedule', 'concern'].includes(key))) {
    throw new HttpError(400, 'Please check the walk-in information.');
  }
  validate('walkInClient', raw.customer);
  const customerId = new mongoose.Types.ObjectId();
  const email = authValidation.email(raw.customer.email);
  const customer = { ...registrationNames(raw.customer), _id: customerId,
    phone: normalizeMobile(raw.customer.phone),
    ...(raw.customer.address?.trim() ? { address: raw.customer.address.trim() } : {}) };
  const vehicle = vehicleInput(raw.vehicle, true);
  const catalogEntry = await toyotaCatalog.validateSelection(vehicle);
  const vehicleId = new mongoose.Types.ObjectId();
  const data = bookings.input({ vehicle: String(vehicleId), services: raw.services, schedule: raw.schedule, concern: raw.concern });
  await holds.releaseExpired({ schedule: data.schedule });
  if (await Vehicle.exists(duplicatePlateFilter(vehicle.plateNumber))) throw duplicatePlateError();
  let result;
  for (let attempt = 0; !result; attempt++) {
    try {
      result = await mongoose.connection.transaction(async session => {
        let user = email ? await matchEmail(email, session) : null;
        const existingClient = Boolean(user && !user.isWalkInCustomer);
        let credentials;
        if (!user || user.isWalkInCustomer) {
          const secret = temporaryPassword();
          const password = await bcrypt.hash(secret, 12);
          const grant = credentialDelivery.issueGrant(operator.id);
          if (user) {
            user = await User.findOneAndUpdate({ _id: user._id, isWalkInCustomer: true, status: 'active', isArchived: false },
              { $set: { email, password, isWalkInCustomer: false, emailVerified: true, mustChangePassword: true, credentialDelivery: grant.metadata },
                $unset: { contactEmail: 1 }, $inc: { authVersion: 1 } }, { session, returnDocument: 'after', runValidators: true })
              .select('fullName email');
            if (!user) throw new HttpError(409, 'This customer changed. Check Existing Customer before trying again.');
          } else {
            [user] = await User.create([{ ...customer, role: 'client', status: 'active',
              email, password, isWalkInCustomer: false, emailVerified: true, mustChangePassword: true,
              credentialDelivery: grant.metadata }], { session });
          }
          if (secret) credentials = { id: String(user._id), fullName: user.fullName, email: user.email, secret, deliveryToken: grant.token };
        }
        await Vehicle.create([{ ...vehicle, _id: vehicleId, owner: user._id, catalogEntry: catalogEntry?._id || null }], { session });
        const bookingId = await bookings.reserveBooking(session, user._id, data, 'walk-in', staffId);
        return { bookingId, credentials, existingClient };
      });
    } catch (error) {
      if (error.code === 11000) {
        const emailDuplicate = error.keyPattern?.email || error.keyValue?.email || error.keyPattern?.contactEmail || error.keyValue?.contactEmail;
        // Another request may have created the client after our lookup. Retry and link to its committed account.
        if (emailDuplicate && email && attempt < 2) continue;
        const message = emailDuplicate ? 'This email could not be linked. Check Existing Customer before trying again.' : duplicateMessage;
        throw new HttpError(409, message, { [emailDuplicate ? 'email' : 'plateNumber']: message });
      }
      throw error;
    }
  }
  // Never email a credential from a retried or rolled-back transaction.
  let delivery;
  if (result.credentials) {
    delivery = await credentialDelivery.send(result.credentials.email, result.credentials.secret);
  }
  return { item: await bookings.get(result.bookingId), accountCreated: Boolean(result.credentials), existingClient: result.existingClient,
    ...(result.credentials ? { account: { id: result.credentials.id, fullName: result.credentials.fullName, email: result.credentials.email },
      deliveryToken: result.credentials.deliveryToken, emailSent: delivery.emailSent } : {}),
    message: delivery?.message || (result.existingClient ? 'Existing client account found. Walk-in booking created.' : 'Walk-in customer, vehicle, and checked-in booking created.') };
}
module.exports = { create, checkEmail, provision, createVisit };
