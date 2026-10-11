const crypto = require('node:crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const EmailOtp = require('../models/EmailOtp');
const { otpConfig } = require('../config/auth');
const HttpError = require('../utils/HttpError');
const emailService = require('./emailService');
const emailDiagnostic = require('../utils/emailDiagnostics');

function digest(email, purpose, value) {
  return crypto.createHmac('sha256', otpConfig().secret)
    .update(JSON.stringify([email, purpose, value])).digest('hex');
}
function eligible(purpose) {
  const filter = { isArchived: false, status: 'active' };
  if (purpose === 'email_verification') return { ...filter, role: 'client', emailVerified: false };
  return { ...filter, $or: [{ role: { $in: ['admin', 'mechanic'] } }, { role: 'client', emailVerified: true }] };
}
async function lockUser(email, purpose, session) {
  // Every issue/verify/reset transaction writes the same User, so concurrent operations conflict and retry.
  return User.findOneAndUpdate({ email, ...eligible(purpose) }, { $inc: { otpSequence: 1 } },
    { returnDocument: 'after', session }).select('+authVersion');
}
async function createOtp(email, purpose, session) {
  const config = otpConfig();
  const previous = await EmailOtp.findOne({ email, purpose }).sort({ createdAt: -1, _id: -1 })
    .select('+otpHash').session(session);
  await EmailOtp.updateMany({ email, purpose }, { $set: { isUsed: true }, $unset: { resetTokenHash: 1 } }, { session });
  let code;
  do { code = String(crypto.randomInt(0, 1000000)).padStart(6, '0'); }
  while (previous && digest(email, purpose, code) === previous.otpHash);
  const [record] = await EmailOtp.create([{
    email, purpose, otpHash: digest(email, purpose, code),
    expiresAt: new Date(Date.now() + config.minutes * 60000),
  }], { session });
  return { id: record._id, email, purpose, code, minutes: config.minutes };
}
async function deliver(challenge) {
  emailDiagnostic(challenge.purpose === 'email_verification' ? 'verificationDeliveryInvoked' : 'resetDeliveryInvoked');
  try { await emailService.sendOtp(challenge); }
  catch {
    emailDiagnostic('deliveryFailedInvalidatingOtp');
    await EmailOtp.updateOne({ _id: challenge.id }, { $set: { isUsed: true }, $unset: { resetTokenHash: 1 } });
    throw new HttpError(503, 'Email delivery is temporarily unavailable. Request a new code later.');
  }
}
async function requestOtp(email, purpose) {
  const config = otpConfig();
  emailService.ensureConfigured(); // Same configuration response for known and unknown accounts.
  const challenge = await mongoose.connection.transaction(async session => {
    const user = await lockUser(email, purpose, session);
    if (!user) return null;
    const latest = await EmailOtp.findOne({ email, purpose }).sort({ createdAt: -1, _id: -1 }).session(session);
    if (latest && Date.now() - latest.createdAt.getTime() < config.cooldownMs) return null;
    return createOtp(email, purpose, session);
  });
  if (challenge) {
    emailDiagnostic('otpCommittedDeliveryPending');
    // Keep resend/recovery responses generic even if SMTP fails for a real account.
    try { await deliver(challenge); } catch { emailDiagnostic('deliveryFailureHiddenByGenericResponse'); }
  } else {
    emailDiagnostic('noChallengeIneligibleOrCooldown');
  }
}
async function verifyOtp(email, code, purpose) {
  const config = otpConfig();
  const outcome = await mongoose.connection.transaction(async session => {
    const user = await lockUser(email, purpose, session);
    if (!user) return null;
    const record = await EmailOtp.findOne({ email, purpose, isUsed: false })
      .sort({ createdAt: -1, _id: -1 }).select('+otpHash').session(session);
    if (!record || record.expiresAt <= new Date() || record.attempts >= config.maxAttempts) return null;

    record.attempts += 1;
    const matches = crypto.timingSafeEqual(Buffer.from(record.otpHash, 'hex'),
      Buffer.from(digest(email, purpose, code), 'hex'));
    if (!matches) {
      if (record.attempts >= config.maxAttempts) record.isUsed = true;
      await record.save({ session });
      return null; // Commit the failed attempt before reporting an error.
    }
    record.isUsed = true;
    let resetToken;
    if (purpose === 'email_verification') {
      user.emailVerified = true;
      await user.save({ session });
    } else {
      resetToken = crypto.randomBytes(32).toString('hex');
      record.resetTokenHash = digest(email, 'reset_grant', resetToken);
      // The consumed code stays unusable; the record now holds a short-lived reset grant.
      record.expiresAt = new Date(Date.now() + config.minutes * 60000);
    }
    await record.save({ session });
    return { resetToken, expiresIn: config.minutes * 60 };
  });
  if (!outcome) throw new HttpError(400, 'Invalid or expired code.', { otp: 'Invalid or expired code.' });
  return outcome;
}
module.exports = { digest, eligible, lockUser, createOtp, deliver, requestOtp, verifyOtp };
