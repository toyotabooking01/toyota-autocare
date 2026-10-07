const HttpError = require('../utils/HttpError');

function secret(name) {
  const value = process.env[name];
  if (!value || Buffer.byteLength(value) < 32 || /^(change|replace|your[_-]|<)/i.test(value)) {
    throw new HttpError(503, 'Authentication configuration is incomplete.');
  }
  return value;
}

function jwtConfig() {
  const duration = process.env.JWT_EXPIRES_IN || '1h';
  const match = /^([1-9]\d*)([smhd])$/.exec(duration);
  const seconds = match && Number(match[1]) * { s: 1, m: 60, h: 3600, d: 86400 }[match[2]];
  if (!seconds || seconds > 86400) throw new HttpError(503, 'Authentication configuration is incomplete.');
  return { secret: secret('JWT_SECRET'), seconds, issuer: 'toyota-autocare', audience: 'toyota-autocare-api' };
}

function otpConfig() {
  const minutes = Number(process.env.OTP_EXPIRY_MINUTES || 5);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 15) {
    throw new HttpError(503, 'Authentication configuration is incomplete.');
  }
  return { secret: secret('OTP_HASH_SECRET'), minutes, maxAttempts: 5, cooldownMs: 60000 };
}

module.exports = { jwtConfig, otpConfig };
