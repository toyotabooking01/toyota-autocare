const HttpError = require('./HttpError');

function body(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'A JSON object is required.');
  }
  return value;
}
function email(value) {
  if (typeof value !== 'string') throw new HttpError(400, 'A valid email is required.');
  const normalized = value.trim().toLowerCase();
  if (normalized.length > 254 || /[<>,;:"\\]/.test(normalized)
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new HttpError(400, 'A valid email is required.');
  }
  return normalized;
}
function password(value, confirmation) {
  if (typeof value !== 'string' || value.length < 12 || Buffer.byteLength(value, 'utf8') > 72) {
    throw new HttpError(400, 'Password must have at least 12 characters and at most 72 UTF-8 bytes.');
  }
  if (confirmation !== undefined && confirmation !== value) {
    throw new HttpError(400, 'Password confirmation does not match.');
  }
  return value;
}
function credentials(value) {
  const input = body(value);
  const normalized = email(input.email);
  if (typeof input.password !== 'string' || !input.password.length || Buffer.byteLength(input.password) > 72) {
    throw new HttpError(400, 'Email and password are required.');
  }
  return { email: normalized, password: input.password };
}
function registration(value) {
  const input = body(value);
  if (typeof input.fullName !== 'string' || !input.fullName.trim() || input.fullName.trim().length > 120) {
    throw new HttpError(400, 'A full name of at most 120 characters is required.');
  }
  if (typeof input.phone !== 'string' || !/^\+?[0-9 ()-]{7,20}$/.test(input.phone.trim())) {
    throw new HttpError(400, 'A valid phone number is required.');
  }
  // Explicit allowlist: role, archive flags and verification flags are never accepted.
  return { fullName: input.fullName.trim(), email: email(input.email), phone: input.phone.trim(),
    password: password(input.password, input.confirmPassword) };
}
function otp(value) {
  const input = body(value);
  if (typeof input.otp !== 'string' || !/^\d{6}$/.test(input.otp)) {
    throw new HttpError(400, 'OTP must contain six numeric digits.');
  }
  return { email: email(input.email), otp: input.otp };
}
module.exports = { body, email, password, credentials, registration, otp };
