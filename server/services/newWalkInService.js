const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const HttpError = require('../utils/HttpError');
const validate = require('../utils/validateForm');
const authValidation = require('../utils/authValidation');
const { registrationNames, normalizeMobile } = require('../../shared/accountValidation.mjs');
const { vehicleInput } = require('./peopleVehiclesService');
const bookings = require('./bookingService');
const emailService = require('./emailService');
const temporaryPassword = require('../utils/temporaryPassword');

const existingEmailMessage = 'This email already has an account. Choose Existing Client instead.';
async function create(raw) {
  authValidation.body(raw);
  if (Object.keys(raw).some(key => !['customer', 'vehicle', 'services', 'schedule', 'concern'].includes(key))) {
    throw new HttpError(400, 'Please check the walk-in information.');
  }
  validate('walkInClient', raw.customer);
  const customer = { ...registrationNames(raw.customer), email: authValidation.email(raw.customer.email),
    phone: normalizeMobile(raw.customer.phone) };
  const vehicle = vehicleInput(raw.vehicle, true);
  const vehicleId = new mongoose.Types.ObjectId();
  const data = bookings.input({ vehicle: String(vehicleId), services: raw.services, schedule: raw.schedule, concern: raw.concern });
  if (await User.exists({ email: customer.email })) throw new HttpError(409, existingEmailMessage, { email: existingEmailMessage });
  if (await Vehicle.exists({ plateNumber: vehicle.plateNumber })) throw new HttpError(409, 'Plate number already exists.', { plateNumber: 'Plate number already exists.' });
  // Fail before writing anything if delivery has not been configured.
  try { emailService.ensureConfigured(); }
  catch { throw new HttpError(503, 'Account email is unavailable. No booking was created. Please try again later.'); }
  const secret = temporaryPassword();
  const password = await bcrypt.hash(secret, 12);
  let bookingId;
  try {
    bookingId = await mongoose.connection.transaction(async session => {
      // Desk-created accounts use email-delivered credentials, not public-registration OTP.
      // Do not fabricate a Terms acceptance timestamp on behalf of the customer.
      const [user] = await User.create([{ ...customer, password, role: 'client', emailVerified: true,
        mustChangePassword: true }], { session });
      await Vehicle.create([{ ...vehicle, _id: vehicleId, owner: user._id }], { session });
      return bookings.reserveBooking(session, user._id, data, 'walk-in');
    });
  } catch (error) {
    if (error.code === 11000) {
      const emailDuplicate = error.keyPattern?.email || error.keyValue?.email;
      const field = emailDuplicate ? 'email' : 'plateNumber';
      const message = emailDuplicate ? existingEmailMessage : 'Plate number already exists.';
      throw new HttpError(409, message, { [field]: message });
    }
    throw error;
  }
  // Delivery is outside the retryable transaction; never send twice on a DB retry.
  let emailSent = true;
  try { await emailService.sendTemporaryPassword({ email: customer.email, password: secret }); }
  catch { emailSent = false; }
  return { item: await bookings.get(bookingId), emailSent,
    message: emailSent ? 'Walk-In booking created. Temporary sign-in details were emailed to the client.'
      : 'The account, vehicle, and booking were created, but the account email could not be sent. Do not create another booking. Ask the client to use Forgot password with their email when delivery is available, then complete the required password change.' };
}
module.exports = { create, temporaryPassword };
