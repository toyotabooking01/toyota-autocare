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

const dummyHash = bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
const genericEmailMessage = 'If the account is eligible, a code will be sent. Please wait 60 seconds before requesting another.';

async function register(body) {
  const input = validation.registration(body);
  otpConfig();
  emailService.ensureConfigured();
  if (await User.exists({ $or: [{ email: input.email }, { contactEmail: input.email }] })) throw new HttpError(409, 'Email is already reserved.', { email: 'Email is already reserved.' });
  const password = await bcrypt.hash(input.password, 12);
  const result = await mongoose.connection.transaction(async session => {
    const [user] = await User.create([{ ...input, password, role: 'client', emailVerified: false }], { session });
    const challenge = await otpService.createOtp(user.email, 'email_verification', session);
    return { user, challenge };
  });
  // Never perform SMTP delivery inside a retryable database transaction.
  await otpService.deliver(result.challenge);
  return {
    message: 'Registration created. Verify your email before logging in.',
    user: safeUser(result.user),
  };
}
async function login(body) {
  const input = validation.credentials(body);
  jwtConfig();
  const user = await User.findOne({ email: input.email }).select('+password +authVersion');
  const fallback = await dummyHash;
  const valid = await bcrypt.compare(input.password, user?.password || fallback);
  if (!user || !valid || user.isArchived || user.status !== 'active' || user.isWalkInCustomer) {
    throw new HttpError(401, 'Invalid email or password.');
  }
  if (!require('../config/roles').roles.includes(user.role)) {
    throw new HttpError(401, 'Your account session could not be verified. Please contact support.');
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
  require('../utils/validateForm')('reset', input);
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
async function changeTemporaryPassword(actor, body) {
  require('../utils/validateForm')('reset', body);
  const newPassword = validation.password(body.newPassword, body.confirmPassword);
  const current = await User.findById(actor._id).select('+password +authVersion');
  if (!current || !current.mustChangePassword) throw new HttpError(409, 'Your password has already been changed. Please sign in again.');
  if (!require('../config/roles').roles.includes(current.role) || current.role !== actor.role) {
    throw new HttpError(401, 'Your account session could not be verified. Please sign in again.');
  }
  if (await bcrypt.compare(newPassword, current.password)) {
    throw new HttpError(400, 'Choose a different password from your temporary password.', { newPassword: 'Choose a different password from your temporary password.' });
  }
  const password = await bcrypt.hash(newPassword, 12);
  const user = await User.findOneAndUpdate({ _id: current._id, password: current.password,
    authVersion: current.authVersion || 0, mustChangePassword: true, status: 'active', isArchived: false },
  { $set: { password, mustChangePassword: false }, $inc: { authVersion: 1 } },
  { returnDocument: 'after', runValidators: true }).select('+authVersion');
  if (!user) throw new HttpError(409, 'Your account changed. Please sign in again.');
  if (user.role !== current.role) throw new HttpError(401, 'Your account session could not be verified. Please sign in again.');
  return { accessToken: signAccessToken(user), user: safeUser(user) };
}
async function updateProfile(actor, body) {
  const input = validation.body(body);
  const allowed = actor.role === 'client' ? ['fullName', 'email', 'phone', 'address'] : ['fullName', 'email', 'phone'];
  if (Object.keys(input).some(key => !allowed.includes(key))) throw new HttpError(400, 'Invalid or unsupported profile fields.');
  require('../utils/validateForm')('accountProfile', input, { skip: actor.role === 'client' ? [] : ['address'] });
  const values = {
    fullName: input.fullName.trim().replace(/\s+/g, ' '),
    email: validation.email(input.email),
    phone: require('../../shared/accountValidation.mjs').normalizeMobile(input.phone),
    ...(actor.role === 'client' ? { address: (input.address || '').trim() } : {}),
  };
  const emailChanged = values.email !== actor.email;
  if (emailChanged && await User.exists({ email: values.email, _id: { $ne: actor._id } }))
    throw new HttpError(409, 'Email is already reserved.', { email: 'Email is already reserved.' });
  if (emailChanged && actor.role === 'client') { otpConfig(); emailService.ensureConfigured(); }
  const user = await User.findOneAndUpdate({ _id: actor._id, email: actor.email, authVersion: actor.authVersion || 0 },
    { $set: { ...values, ...(emailChanged && actor.role === 'client' ? { emailVerified: false } : {}) },
      ...(emailChanged ? { $inc: { authVersion: 1 } } : {}) },
    { returnDocument: 'after', runValidators: true }).select('+authVersion');
  if (!user) throw new HttpError(409, 'Your account changed. Refresh and try again.');
  if (emailChanged && actor.role === 'client') {
    // The existing verification flow sends a code to the new address.
    await otpService.requestOtp(user.email, 'email_verification');
    return { user: safeUser(user), verificationRequired: true };
  }
  return { user: safeUser(user), ...(emailChanged ? { accessToken: signAccessToken(user) } : {}) };
}
const { changePassword } = require('./passwordChangeService');
module.exports = { register, login, verifyEmail, resendVerification, forgotPassword, verifyResetOtp, resetPassword, changeTemporaryPassword, updateProfile, changePassword };
