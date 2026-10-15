const mongoose = require('mongoose');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const HttpError = require('../utils/HttpError');
const { duplicatePlateFilter, duplicatePlateError, duplicateMessage } = require('../utils/plateNumbers');
const validate = require('../utils/validateForm');
const authValidation = require('../utils/authValidation');
const { registrationNames, normalizeMobile } = require('../../shared/accountValidation.mjs');
const { vehicleInput } = require('./peopleVehiclesService');
const toyotaCatalog = require('./toyotaCatalogService');
const bookings = require('./bookingService');
const bcrypt = require('bcrypt');
const temporaryPassword = require('../utils/temporaryPassword');
const credentialDelivery = require('./clientCredentialDeliveryService');

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
    message: user ? user.isWalkInCustomer ? 'Existing walk-in customer found. A Client login will be created.' : 'Existing client account found.' : '' };
}
async function create(raw, staffId) {
  authValidation.body(raw);
  if (Object.keys(raw).some(key => !['customer', 'vehicle', 'services', 'schedule', 'concern'].includes(key))) {
    throw new HttpError(400, 'Please check the walk-in information.');
  }
  validate('walkInClient', raw.customer);
  const customerId = new mongoose.Types.ObjectId();
  const email = raw.customer.email?.trim() ? authValidation.email(raw.customer.email) : undefined;
  const customer = { ...registrationNames(raw.customer), _id: customerId,
    // Keep the existing required, unique login-email index intact. This address is internal only.
    email: `walkin-${customerId}@no-login.toyota-autocare.invalid`,
    isWalkInCustomer: true, phone: normalizeMobile(raw.customer.phone),
    ...(raw.customer.address?.trim() ? { address: raw.customer.address.trim() } : {}) };
  const vehicle = vehicleInput(raw.vehicle, true);
  const catalogEntry = await toyotaCatalog.validateSelection(vehicle);
  const vehicleId = new mongoose.Types.ObjectId();
  const data = bookings.input({ vehicle: String(vehicleId), services: raw.services, schedule: raw.schedule, concern: raw.concern });
  if (await Vehicle.exists(duplicatePlateFilter(vehicle.plateNumber))) throw duplicatePlateError();
  let result;
  for (let attempt = 0; !result; attempt++) {
    try {
      result = await mongoose.connection.transaction(async session => {
        let user = email ? await matchEmail(email, session) : null;
        const existingClient = Boolean(user && !user.isWalkInCustomer);
        let credentials;
        if (!user || user.isWalkInCustomer) {
          // Generate only for a new login; no secret is generated for matched online clients or offline visits.
          const secret = email ? temporaryPassword() : undefined;
          const password = secret ? await bcrypt.hash(secret, 12) : undefined;
          const grant = secret ? credentialDelivery.issueGrant(staffId) : undefined;
          if (user) {
            user = await User.findOneAndUpdate({ _id: user._id, isWalkInCustomer: true, status: 'active', isArchived: false },
              { $set: { email, password, isWalkInCustomer: false, emailVerified: true, mustChangePassword: true, credentialDelivery: grant.metadata },
                $unset: { contactEmail: 1 }, $inc: { authVersion: 1 } }, { session, returnDocument: 'after', runValidators: true })
              .select('fullName email');
            if (!user) throw new HttpError(409, 'This customer changed. Check Existing Customer before trying again.');
          } else {
            [user] = await User.create([{ ...customer, role: 'client', status: 'active',
              ...(email ? { email, password, isWalkInCustomer: false, emailVerified: true, mustChangePassword: true, credentialDelivery: grant.metadata }
                : { emailVerified: false, mustChangePassword: false }) }], { session });
          }
          if (secret) credentials = { id: String(user._id), fullName: user.fullName, email: user.email, secret, deliveryToken: grant.token };
        }
        await Vehicle.create([{ ...vehicle, _id: vehicleId, owner: user._id, catalogEntry: catalogEntry._id }], { session });
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
module.exports = { create, checkEmail };
