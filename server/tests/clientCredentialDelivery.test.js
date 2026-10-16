const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const emailService = require('../services/emailService');
const delivery = require('../services/clientCredentialDeliveryService');

async function setup(t) {
  const staff = new mongoose.Types.ObjectId();
  const grant = delivery.issueGrant(staff);
  const user = new User({ fullName: 'Client Example', email: 'client@example.invalid', role: 'client', status: 'active',
    emailVerified: true, mustChangePassword: true, credentialDelivery: grant.metadata, password: await bcrypt.hash('Old temporary journey 42!', 4) });
  const messages = [];
  const matches = filter => Object.entries(filter).every(([path, expected]) => {
    const actual = user.get(path);
    return expected?.$gt ? actual > expected.$gt : expected?.$lte ? actual <= expected.$lte : String(actual) === String(expected);
  });
  t.mock.method(User, 'exists', async filter => matches(filter));
  t.mock.method(User, 'findOneAndUpdate', (filter, update) => ({ select: async () => {
    if (!matches(filter)) return null;
    for (const [path, value] of Object.entries(update.$set)) user.set(path, value);
    user.authVersion += update.$inc.authVersion;
    return user;
  } }));
  t.mock.method(emailService, 'sendTemporaryPassword', async message => { messages.push(message); });
  return { staff, user, grant, messages };
}

test('resend emails a fresh secure password to the registered email, rotates the hash and never returns secrets', async t => {
  const { staff, user, grant, messages } = await setup(t);
  const oldHash = user.password;
  const result = await delivery.resend(user._id, staff, { deliveryToken: grant.token });
  assert.equal(result.emailSent, true); assert.equal(result.resendAfter, 60);
  assert.equal(messages[0].email, user.email); assert.equal(messages[0].accountType, 'client');
  assert.equal(require('../../shared/accountValidation.cjs').passwordError(messages[0].password), '');
  assert.ok(await bcrypt.compare(messages[0].password, user.password)); assert.equal(bcrypt.getRounds(user.password), 12);
  assert.notEqual(user.password, oldHash); assert.equal(user.authVersion, 1); assert.equal(user.mustChangePassword, true);
  assert.equal(JSON.stringify(result).includes(messages[0].password), false);
  assert.equal(user.toJSON().credentialDelivery, undefined);
  assert.equal(require('../utils/safeUser')(user).credentialDelivery, undefined);
  await assert.rejects(delivery.resend(user._id, staff, { deliveryToken: grant.token }), { status: 409 });
  assert.equal(messages.length, 1, 'cooldown blocks repeat emails');
});

test('email failure is reported honestly and retry remains possible without plaintext storage', async t => {
  const { staff, user, grant, messages } = await setup(t);
  t.mock.method(emailService, 'sendTemporaryPassword', async message => { messages.push(message); throw new Error('SMTP failed'); });
  const failed = await delivery.resend(user._id, staff, { deliveryToken: grant.token });
  assert.equal(failed.emailSent, false); assert.match(failed.message, /could not be delivered/);
  assert.equal(JSON.stringify(failed).includes(messages[0].password), false);
  user.credentialDelivery.nextAttemptAt = new Date(0);
  t.mock.method(emailService, 'sendTemporaryPassword', async message => { messages.push(message); });
  const retried = await delivery.resend(user._id, staff, { deliveryToken: grant.token });
  assert.equal(retried.emailSent, true); assert.notEqual(messages[1].password, messages[0].password);
  assert.equal(await bcrypt.compare(messages[0].password, user.password), false);
});

test('resend grants are Staff-bound, client-bound, expiring and unusable after first-login setup', async t => {
  const { staff, user, grant, messages } = await setup(t);
  const body = { deliveryToken: grant.token };
  await assert.rejects(delivery.resend(user._id, new mongoose.Types.ObjectId(), body), { status: 409 });
  await assert.rejects(delivery.resend(new mongoose.Types.ObjectId(), staff, body), { status: 409 });
  await assert.rejects(delivery.resend(user._id, staff, { deliveryToken: 'a'.repeat(64) }), { status: 409 });
  await assert.rejects(delivery.resend(user._id, staff, { ...body, email: 'attacker@example.invalid' }), { status: 400 });
  user.credentialDelivery.expiresAt = new Date(0);
  await assert.rejects(delivery.resend(user._id, staff, body), { status: 409 });
  user.credentialDelivery.expiresAt = new Date(Date.now() + 60000); user.mustChangePassword = false;
  await assert.rejects(delivery.resend(user._id, staff, body), { status: 409 });
  assert.equal(messages.length, 0);
});

test('an existing Client without a provisioning grant cannot have its password reset by Staff', async t => {
  const { staff, user, grant, messages } = await setup(t);
  user.credentialDelivery = undefined;
  const oldHash = user.password;
  await assert.rejects(delivery.resend(user._id, staff, { deliveryToken: grant.token }), { status: 409 });
  assert.equal(user.password, oldHash); assert.equal(messages.length, 0);
});
