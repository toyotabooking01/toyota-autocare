const crypto = require('node:crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const EmailOtp = require('../models/EmailOtp');
const validation = require('../utils/authValidation');
const { passwordError } = require('../../shared/accountValidation.mjs');
const HttpError = require('../utils/HttpError');
const { otpConfig } = require('../config/auth');
const otpService = require('./otpService');
const emailService = require('./emailService');
const { signAccessToken } = require('./tokenService');
const safeUser = require('../utils/safeUser');

const purpose = 'password_change';
function inputFields(body, allowed) {
  const input = validation.body(body);
  if (Object.keys(input).some(key => !allowed.includes(key))) throw new HttpError(400, 'Invalid or unsupported password fields.');
  return input;
}
function binding(actor) {
  return { email: actor.email, purpose, account: actor._id, authVersion: actor.authVersion || 0 };
}
async function lockAccount(actor, session) {
  const user = await User.findOneAndUpdate({ _id: actor._id, email: actor.email,
    role: actor.role, authVersion: actor.authVersion || 0, status: 'active', isArchived: false, mustChangePassword: false },
  { $inc: { otpSequence: 1 } }, { returnDocument: 'after', session }).select('+password +authVersion');
  if (!user) throw new HttpError(409, 'Your account changed. Please sign in again.');
  return user;
}
async function requestCode(actor, body) {
  const input = inputFields(body, ['currentPassword']);
  if (typeof input.currentPassword !== 'string' || !input.currentPassword)
    throw new HttpError(400, 'Current password is required.', { currentPassword: 'Current password is required.' });
  const config = otpConfig();
  const challenge = await mongoose.connection.transaction(async session => {
    const user = await lockAccount(actor, session);
    if (!await bcrypt.compare(input.currentPassword, user.password))
      throw new HttpError(400, 'Current password is incorrect.', { currentPassword: 'Current password is incorrect.' });
    emailService.ensureConfigured();
    const latest = await EmailOtp.findOne({ email: user.email, purpose }).sort({ createdAt: -1, _id: -1 }).session(session);
    if (latest && Date.now() - latest.createdAt.getTime() < config.cooldownMs)
      throw new HttpError(429, 'Please wait before requesting another code.');
    return otpService.createOtp(user.email, purpose, session, { account: user._id, authVersion: user.authVersion || 0 });
  });
  await otpService.deliver(challenge);
  return { message: 'Verification code sent.', resendAfter: config.cooldownMs / 1000 };
}
async function verifyCode(actor, body) {
  const input = inputFields(body, ['otp']);
  if (typeof input.otp !== 'string' || !/^\d{6}$/.test(input.otp))
    throw new HttpError(400, 'Enter the 6-digit verification code.', { otp: 'Enter the 6-digit verification code.' });
  const config = otpConfig();
  const result = await mongoose.connection.transaction(async session => {
    await lockAccount(actor, session);
    const record = await EmailOtp.findOne({ ...binding(actor), isUsed: false })
      .sort({ createdAt: -1, _id: -1 }).select('+otpHash').session(session);
    if (!record || record.expiresAt <= new Date() || record.attempts >= config.maxAttempts) return null;
    record.attempts += 1;
    const matches = crypto.timingSafeEqual(Buffer.from(record.otpHash, 'hex'), Buffer.from(otpService.digest(actor.email, purpose, input.otp), 'hex'));
    if (!matches) {
      if (record.attempts >= config.maxAttempts) record.isUsed = true;
      await record.save({ session });
      return null; // Commit failed attempts before reporting the error.
    }
    const verificationToken = crypto.randomBytes(32).toString('hex');
    record.isUsed = true;
    record.verificationTokenHash = otpService.digest(actor.email, 'password_change_grant', verificationToken);
    record.expiresAt = new Date(Date.now() + config.minutes * 60000);
    await record.save({ session });
    return { verificationToken, expiresIn: config.minutes * 60 };
  });
  if (!result) throw new HttpError(400, 'Invalid verification code.', { otp: 'Invalid verification code.' });
  return result;
}
async function changePassword(actor, body) {
  const input = inputFields(body, ['verificationToken', 'newPassword', 'confirmPassword']);
  const errors = {};
  const policyError = passwordError(input.newPassword);
  if (policyError) errors.newPassword = policyError.includes('Use at least') ? 'Password does not meet the requirements.' : policyError;
  if (!input.confirmPassword) errors.confirmPassword = 'Confirm your new password.';
  else if (input.confirmPassword !== input.newPassword) errors.confirmPassword = 'Passwords do not match.';
  if (Object.keys(errors).length) throw new HttpError(400, 'Check your password fields.', errors);
  if (typeof input.verificationToken !== 'string' || !/^[a-f0-9]{64}$/.test(input.verificationToken))
    throw new HttpError(400, 'Verify your email before changing your password.', { verificationToken: 'Verification has expired. Start again.' });
  const hash = otpService.digest(actor.email, 'password_change_grant', input.verificationToken);
  const password = await bcrypt.hash(input.newPassword, 12);
  const user = await mongoose.connection.transaction(async session => {
    const current = await lockAccount(actor, session);
    const grant = await EmailOtp.findOneAndUpdate({ ...binding(actor), isUsed: true,
      verificationTokenHash: hash, expiresAt: { $gt: new Date() } },
    { $unset: { verificationTokenHash: 1 } }, { session, returnDocument: 'after' });
    if (!grant) throw new HttpError(400, 'Verify your email before changing your password.', { verificationToken: 'Verification has expired. Start again.' });
    if (await bcrypt.compare(input.newPassword, current.password))
      throw new HttpError(400, 'Choose a different password.', { newPassword: 'Choose a different password.' });
    current.password = password;
    current.authVersion = (current.authVersion || 0) + 1;
    await current.save({ session });
    await EmailOtp.updateMany({ email: actor.email, purpose }, { $set: { isUsed: true }, $unset: { verificationTokenHash: 1 } }, { session });
    return current;
  });
  return { accessToken: signAccessToken(user), user: safeUser(user) };
}
module.exports = { requestCode, verifyCode, changePassword };
