const crypto = require('node:crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const temporaryPassword = require('../utils/temporaryPassword');
const emailService = require('./emailService');
const HttpError = require('../utils/HttpError');

const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function issueGrant(staffId) {
  if (!mongoose.isObjectIdOrHexString(staffId)) throw new HttpError(400, 'A valid Staff account is required.');
  const token = crypto.randomBytes(32).toString('hex');
  return { token, metadata: { staff: staffId, tokenHash: digest(token),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), nextAttemptAt: new Date(0) } };
}
async function send(email, password) {
  try {
    await emailService.sendTemporaryPassword({ email, password, accountType: 'client' });
    return { emailSent: true, message: 'Login credentials sent successfully.' };
  } catch {
    return { emailSent: false, message: 'Client account created, but the temporary password email could not be delivered.' };
  }
}
async function resend(clientId, staffId, body) {
  if (!mongoose.isObjectIdOrHexString(clientId) || !body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(key => key !== 'deliveryToken') || typeof body.deliveryToken !== 'string' || !/^[a-f0-9]{64}$/.test(body.deliveryToken))
    throw new HttpError(400, 'Invalid credential delivery request.');
  const filter = { _id: clientId, role: 'client', isWalkInCustomer: false,
    status: 'active', isArchived: false, mustChangePassword: true,
    'credentialDelivery.staff': staffId, 'credentialDelivery.tokenHash': digest(body.deliveryToken),
    'credentialDelivery.expiresAt': { $gt: new Date() }, 'credentialDelivery.nextAttemptAt': { $lte: new Date() } };
  const unavailable = () => new HttpError(409, 'Credentials cannot be resent right now. Wait one minute and retry. After first-login setup or expiry, the customer must use Forgot password.');
  if (!await User.exists(filter)) throw unavailable();
  const secret = temporaryPassword();
  const password = await bcrypt.hash(secret, 12);
  filter['credentialDelivery.expiresAt'] = { $gt: new Date() };
  filter['credentialDelivery.nextAttemptAt'] = { $lte: new Date() };
  // Claim one resend atomically. First-login completion wins over any later resend request.
  const account = await User.findOneAndUpdate(filter,
  { $set: { password, 'credentialDelivery.nextAttemptAt': new Date(Date.now() + 60000) }, $inc: { authVersion: 1 } },
  { returnDocument: 'after', runValidators: true }).select('fullName email');
  if (!account) throw unavailable();
  return { ...await send(account.email, secret), resendAfter: 60 };
}
module.exports = { issueGrant, send, resend };
