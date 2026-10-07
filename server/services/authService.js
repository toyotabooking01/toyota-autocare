const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const EmailOtp = require('../models/EmailOtp');
const validation = require('../utils/authValidation');
const safeUser = require('../utils/safeUser');
const HttpError = require('../utils/HttpError');
const { jwtConfig, otpConfig } = require('../config/auth');
const emailService = require('./emailService');
const otpService = require('./otpService');
const { signAccessToken } = require('./tokenService');
const { autoVerifyNewClient } = require('../config/emailBehavior');

const dummyHash = bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
const genericEmailMessage = 'If the account is eligible, a code will be sent. Please wait 60 seconds before requesting another.';

async function register(body) {
  const input = validation.registration(body);
  const autoVerified = autoVerifyNewClient();
  if (!autoVerified) {
    otpConfig();
    emailService.ensureConfigured();
  }
  if (await User.exists({ email: input.email })) throw new HttpError(409, 'Email is already reserved.');
  const password = await bcrypt.hash(input.password, 12);
  const result = await mongoose.connection.transaction(async session => {
    const [user] = await User.create([{ ...input, password, role: 'client', emailVerified: autoVerified }], { session });
    const challenge = autoVerified ? null : await otpService.createOtp(user.email, 'email_verification', session);
    return { user, challenge };
  });
  // Never perform SMTP delivery inside a retryable database transaction.
  if (result.challenge) await otpService.deliver(result.challenge);
  return {
    message: autoVerified ? 'Development account created. You can now log in.'
      : 'Registration created. Verify your email before logging in.',
    user: safeUser(result.user),
  };
}
async function login(body) {
  const input = validation.credentials(body);
  jwtConfig();
  const user = await User.findOne({ email: input.email }).select('+password +authVersion');
  const fallback = await dummyHash;
  const valid = await bcrypt.compare(input.password, user?.password || fallback);
  if (!user || !valid || user.isArchived || user.status !== 'active') {
    throw new HttpError(401, 'Invalid email or password.');
  }
  if (user.role === 'client' && !user.emailVerified) throw new HttpError(403, 'Verify your email before logging in.');
  return { accessToken: signAccessToken(user), tokenType: 'Bearer', expiresIn: jwtConfig().seconds, user: safeUser(user) };
}
async function verifyEmail(body) {
  const input = validation.otp(body);
  await otpService.verifyOtp(input.email, input.otp, 'email_verification');
  return { message: 'Email verified. You can now log in.' };
}
async function resendVerification(body) {
  const email = validation.email(validation.body(body).email);
  await otpService.requestOtp(email, 'email_verification');
  return { message: genericEmailMessage };
}
async function forgotPassword(body) {
  const email = validation.email(validation.body(body).email);
  await otpService.requestOtp(email, 'password_reset');
  return { message: genericEmailMessage };
}
async function verifyResetOtp(body) {
  const input = validation.otp(body);
  const result = await otpService.verifyOtp(input.email, input.otp, 'password_reset');
  return { message: 'Code verified. Submit your new password with the reset token.', ...result };
}
async function resetPassword(body) {
  const input = validation.body(body);
  const email = validation.email(input.email);
  const newPassword = validation.password(input.newPassword, input.confirmPassword);
  if (typeof input.resetToken !== 'string' || !/^[a-f0-9]{64}$/.test(input.resetToken)) {
    throw new HttpError(400, 'Invalid or expired reset token.');
  }
  const hash = otpService.digest(email, 'reset_grant', input.resetToken);
  const password = await bcrypt.hash(newPassword, 12);
  const updated = await mongoose.connection.transaction(async session => {
    const user = await otpService.lockUser(email, 'password_reset', session);
    if (!user) return false;
    const grant = await EmailOtp.findOneAndUpdate({
      email, purpose: 'password_reset', isUsed: true, resetTokenHash: hash, expiresAt: { $gt: new Date() },
    }, { $unset: { resetTokenHash: 1 } }, { session, returnDocument: 'after' });
    if (!grant) return false;
    user.password = password;
    user.authVersion = (user.authVersion || 0) + 1;
    await user.save({ session });
    await EmailOtp.updateMany({ email, purpose: 'password_reset' },
      { $set: { isUsed: true }, $unset: { resetTokenHash: 1 } }, { session });
    return true;
  });
  if (!updated) throw new HttpError(400, 'Invalid or expired reset token.');
  return { message: 'Password reset. Log in with your new password.' };
}
module.exports = { register, login, verifyEmail, resendVerification, forgotPassword, verifyResetOtp, resetPassword };
