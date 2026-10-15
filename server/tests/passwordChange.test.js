const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
process.env.OTP_HASH_SECRET = crypto.randomBytes(32).toString('hex');
const User = require('../models/User');
const EmailOtp = require('../models/EmailOtp');
const emailService = require('../services/emailService');
const otpService = require('../services/otpService');
const service = require('../services/passwordChangeService');
const { verifyAccessToken } = require('../services/tokenService');
const oldPassword = 'Current secure journey 42!';
const newPassword = 'New secure journey 42!';
const values = { newPassword, confirmPassword: newPassword };

async function setup(t, role = 'client') {
  const actor = { _id: new mongoose.Types.ObjectId(), email: `${role}@example.invalid`, role, authVersion: 0 };
  const user = new User({ ...actor, fullName: 'Test Person', password: await bcrypt.hash(oldPassword, 4),
    status: 'active', isArchived: false, mustChangePassword: false, emailVerified: true });
  const records = [], deliveries = [], sessions = [];
  function matches(record, filter) {
    return Object.entries(filter).every(([key, value]) => value?.$gt
      ? record[key] > value.$gt : String(record[key]) === String(value));
  }
  function query(value) {
    const result = { sort: () => result, select: () => result, session: () => result,
      then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) };
    return result;
  }
  function update(record, change) {
    for (const key of Object.keys(change.$unset || {})) record[key] = undefined;
    Object.assign(record, change.$set || {});
  }
  t.mock.method(mongoose.connection, 'transaction', async callback => {
    const session = {}; sessions.push(session);
    const before = user.toObject(), snapshots = records.map(record => record.toObject());
    try { return await callback(session); }
    catch (error) {
      user.set(before); records.splice(snapshots.length);
      snapshots.forEach((snapshot, index) => records[index].set(snapshot));
      throw error;
    }
  });
  t.mock.method(User, 'findOneAndUpdate', (filter, change, options) => {
    assert.ok(sessions.includes(options.session), 'account locks are transactional');
    assert.equal(filter._id, actor._id);
    return query(matches(user, filter) ? user : null);
  });
  t.mock.method(user, 'save', async options => { assert.ok(sessions.includes(options.session)); return user; });
  t.mock.method(EmailOtp, 'findOne', filter => query(records.findLast(record => matches(record, filter)) || null));
  t.mock.method(EmailOtp, 'create', async (items, options) => items.map(item => {
    assert.ok(sessions.includes(options.session));
    const record = new EmailOtp({ ...item, createdAt: new Date() });
    t.mock.method(record, 'save', async saveOptions => { assert.ok(sessions.includes(saveOptions.session)); return record; });
    records.push(record); return record;
  }));
  t.mock.method(EmailOtp, 'updateMany', async (filter, change) => {
    records.filter(record => matches(record, filter)).forEach(record => update(record, change));
  });
  t.mock.method(EmailOtp, 'updateOne', async (filter, change) => {
    const record = records.find(item => matches(item, filter)); if (record) update(record, change);
  });
  t.mock.method(EmailOtp, 'findOneAndUpdate', async (filter, change, options) => {
    assert.ok(sessions.includes(options.session));
    const record = records.find(item => matches(item, filter));
    if (record) update(record, change); return record || null;
  });
  t.mock.method(emailService, 'ensureConfigured', () => {});
  t.mock.method(emailService, 'sendOtp', async challenge => { deliveries.push(challenge); });
  return { actor, user, records, deliveries };
}

test('all roles require current password then email OTP; success rotates the session and consumes the grant', async t => {
  for (const role of ['admin', 'client', 'staff', 'mechanic']) await t.test(role, async t => {
    const { actor, user, records, deliveries } = await setup(t, role);
    await assert.rejects(service.requestCode(actor, { currentPassword: 'wrong' }), { errors: { currentPassword: 'Current password is incorrect.' } });
    assert.equal(deliveries.length, 0);
    const sent = await service.requestCode(actor, { currentPassword: oldPassword });
    assert.equal(sent.resendAfter, 60);
    assert.equal(deliveries[0].email, actor.email);
    assert.equal(deliveries[0].purpose, 'password_change');
    assert.match(deliveries[0].code, /^\d{6}$/);
    assert.notEqual(records[0].otpHash, deliveries[0].code);
    const grant = await service.verifyCode(actor, { otp: deliveries[0].code });
    await assert.rejects(service.verifyCode(actor, { otp: deliveries[0].code }), { errors: { otp: 'Invalid verification code.' } });
    const result = await service.changePassword(actor, { ...values, verificationToken: grant.verificationToken });
    assert.ok(await bcrypt.compare(newPassword, user.password));
    assert.equal(bcrypt.getRounds(user.password), 12);
    assert.equal(verifyAccessToken(result.accessToken).version, 1);
    assert.equal(result.user.password, undefined);
    assert.equal(records[0].verificationTokenHash, undefined);
    await assert.rejects(service.changePassword({ ...actor, authVersion: 1 }, { ...values, verificationToken: grant.verificationToken }), { status: 400 });
  });
});

test('bypassed steps, unsupported fields, weak passwords, mismatch and password reuse are rejected', async t => {
  const { actor, records, deliveries } = await setup(t);
  await assert.rejects(service.changePassword(actor, values), { status: 400 });
  await assert.rejects(service.changePassword(actor, { ...values, currentPassword: oldPassword }), { status: 400 });
  await assert.rejects(service.requestCode(actor, { currentPassword: oldPassword, email: 'other@example.invalid' }), { status: 400 });
  await service.requestCode(actor, { currentPassword: oldPassword });
  const grant = await service.verifyCode(actor, { otp: deliveries[0].code });
  const verified = { ...values, verificationToken: grant.verificationToken };
  await assert.rejects(service.changePassword(actor, { ...verified, newPassword: 'short', confirmPassword: 'short' }), { errors: { newPassword: 'Password does not meet the requirements.' } });
  await assert.rejects(service.changePassword(actor, { ...verified, confirmPassword: 'other' }), { errors: { confirmPassword: 'Passwords do not match.' } });
  await assert.rejects(service.changePassword(actor, { ...verified, newPassword: oldPassword, confirmPassword: oldPassword }), { errors: { newPassword: 'Choose a different password.' } });
  assert.ok(records[0].verificationTokenHash, 'failed password validation retains the grant');
  await service.changePassword(actor, verified);
});

test('OTP expiry, failed attempt limits, resend cooldown, replacement codes and delivery failures are enforced', async t => {
  const { actor, records, deliveries } = await setup(t);
  await service.requestCode(actor, { currentPassword: oldPassword });
  await assert.rejects(service.requestCode(actor, { currentPassword: oldPassword }), { status: 429 });
  const wrong = String((Number(deliveries[0].code) + 1) % 1000000).padStart(6, '0');
  for (let attempt = 0; attempt < 5; attempt++) await assert.rejects(service.verifyCode(actor, { otp: wrong }), { status: 400 });
  assert.equal(records[0].attempts, 5);
  await assert.rejects(service.verifyCode(actor, { otp: deliveries[0].code }), { status: 400 });
  records[0].createdAt = new Date(Date.now() - 61000);
  await service.requestCode(actor, { currentPassword: oldPassword });
  await assert.rejects(service.verifyCode(actor, { otp: deliveries[0].code }), { status: 400 });
  records[1].expiresAt = new Date(Date.now() - 1);
  await assert.rejects(service.verifyCode(actor, { otp: deliveries[1].code }), { status: 400 });
  records[1].createdAt = new Date(Date.now() - 61000);
  t.mock.method(emailService, 'sendOtp', async () => { throw new Error('SMTP unavailable'); });
  await assert.rejects(service.requestCode(actor, { currentPassword: oldPassword }), { status: 503 });
  assert.equal(records[2].isUsed, true, 'undelivered code is invalidated');
});

test('grants are purpose-specific, account-bound, version-bound, expiring and invalidated by resend', async t => {
  const { actor, records, deliveries } = await setup(t);
  await service.requestCode(actor, { currentPassword: oldPassword });
  const grant = await service.verifyCode(actor, { otp: deliveries[0].code });
  const input = { ...values, verificationToken: grant.verificationToken };
  records[0].account = new mongoose.Types.ObjectId();
  await assert.rejects(service.changePassword(actor, input), { status: 400 });
  records[0].account = actor._id; records[0].authVersion = 1;
  await assert.rejects(service.changePassword(actor, input), { status: 400 });
  records[0].authVersion = 0; records[0].verificationTokenHash = otpService.digest(actor.email, 'reset_grant', grant.verificationToken);
  await assert.rejects(service.changePassword(actor, input), { status: 400 });
  records[0].verificationTokenHash = otpService.digest(actor.email, 'password_change_grant', grant.verificationToken);
  records[0].expiresAt = new Date(Date.now() - 1);
  await assert.rejects(service.changePassword(actor, input), { status: 400 });
  records[0].expiresAt = new Date(Date.now() + 60000); records[0].createdAt = new Date(Date.now() - 61000);
  await service.requestCode(actor, { currentPassword: oldPassword });
  await assert.rejects(service.changePassword(actor, input), { status: 400 });
  const json = records[0].toJSON();
  for (const key of ['otpHash', 'verificationTokenHash', 'account', 'authVersion']) assert.equal(json[key], undefined);
});
