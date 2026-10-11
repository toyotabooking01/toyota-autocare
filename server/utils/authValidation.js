const HttpError = require('./HttpError');
const validate = require('./validateForm');
const { normalizeMobile, registrationNames } = require('../../shared/accountValidation.mjs');

function body(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'A JSON object is required.');
  return value;
}
function email(value) {
  validate('email', { email: value });
  return value.trim().toLowerCase();
}
function password(value, confirmation) {
  validate('mechanic', { password: value }, { partial: true });
  if (confirmation !== undefined && confirmation !== value) {
    throw new HttpError(400, 'Password confirmation does not match.', { confirmPassword: 'Password confirmation does not match.' });
  }
  return value;
}
function credentials(value) {
  const input = body(value);
  validate('login', input);
  return { email: email(input.email), password: input.password };
}
function profile(value) {
  const input = body(value);
  validate('register', input, { skip: ['termsAccepted'] });
  // Public callers cannot supply roles, archive flags or verification flags.
  return { fullName: input.fullName.trim(), email: email(input.email), phone: normalizeMobile(input.phone), password: input.password };
}
function registration(value) {
  const input = body(value);
  validate('clientRegistration', input);
  return { ...registrationNames(input), email: email(input.email), phone: normalizeMobile(input.phone), password: input.password, termsAcceptedAt: new Date() };
}
function otp(value) {
  const input = body(value);
  validate('otp', input);
  return { email: email(input.email), otp: input.otp.trim() };
}
module.exports = { body, email, password, credentials, registration, profile, otp };
