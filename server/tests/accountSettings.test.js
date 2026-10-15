const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const crypto = require('node:crypto');
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
process.env.JWT_EXPIRES_IN = '1h';
const authService = require('../services/authService');
const User = require('../models/User');
const validate = require('../utils/validateForm');
const safeUser = require('../utils/safeUser');

const actor = { _id: new mongoose.Types.ObjectId(), role: 'client', email: 'client@example.invalid', authVersion: 0 };
const profile = { firstName: 'Juan', lastName: 'Santos', phone: '09171234567', address: 'Quezon City' };

test('account profile uses existing mobile rules and rejects privileged fields', async () => {
  assert.doesNotThrow(() => validate('accountProfile', profile));
  assert.throws(() => validate('accountProfile', { ...profile, phone: '12345' }), { status: 400 });
  await assert.rejects(authService.updateProfile(actor, { ...profile, role: 'admin' }), { status: 400 });
  await assert.rejects(authService.updateProfile({ ...actor, role: 'mechanic' }, profile), { status: 400 });
});

test('profile save normalizes mobile and only writes allowed fields', async t => {
  let update;
  t.mock.method(User, 'findOneAndUpdate', (filter, change) => {
    update = { filter, change };
    return { select: async () => ({ ...actor, ...change.$set, createdAt: new Date('2025-01-01') }) };
  });
  const result = await authService.updateProfile(actor, profile);
  assert.equal(update.filter._id, actor._id);
  assert.equal(update.change.$set.phone, '+639171234567');
  assert.equal(update.change.$set.fullName, 'Juan Santos');
  assert.equal(update.change.$set.address, 'Quezon City');
  assert.equal(update.change.$set.role, undefined);
  assert.equal(result.user.address, 'Quezon City');
  assert.equal(result.accessToken, undefined);
});


for (const role of ['admin', 'client', 'staff', 'mechanic']) {
  test(role + ' profile rejects email before any database write', async t => {
    t.mock.method(User, 'findOneAndUpdate', () => assert.fail('Email must not reach a database write'));
    const values = { firstName: profile.firstName, lastName: profile.lastName, phone: profile.phone, ...(role === 'client' ? { address: profile.address } : {}) };
    for (const email of ['changed@example.invalid', actor.email, null, { $set: 'changed@example.invalid' }]) {
      await assert.rejects(authService.updateProfile({ ...actor, role }, { ...values, email }), { status: 400 });
    }
  });
  test(role + ' profile saves editable fields and preserves email', async t => {
    t.mock.method(User, 'findOneAndUpdate', (filter, change) => {
      assert.deepEqual(Object.keys(change), ['$set']);
      assert.deepEqual(Object.keys(change.$set).sort(), role === 'client' ? ['address', 'firstName', 'fullName', 'lastName', 'phone'] : ['firstName', 'fullName', 'lastName', 'phone']);
      return { select: async () => ({ ...actor, role, ...change.$set }) };
    });
    const { user } = await authService.updateProfile({ ...actor, role }, { firstName: profile.firstName, lastName: profile.lastName, phone: profile.phone, ...(role === 'client' ? { address: profile.address } : {}) });
    assert.equal(user.email, actor.email);
    assert.equal(user.fullName, 'Juan Santos');
    assert.equal(user.firstName, 'Juan');
    assert.equal(user.lastName, 'Santos');
    assert.equal(user.phone, '+639171234567');
  });
}

test('profile name updates retain an existing middle name and suffix', async t => {
  t.mock.method(User, 'findOneAndUpdate', (_filter, change) => {
    assert.equal(change.$set.fullName, 'Maria Luz Reyes Jr.');
    return { select: async () => ({ ...actor, ...change.$set }) };
  });
  await authService.updateProfile({ ...actor, middleName: 'Luz', suffix: 'Jr.' },
    { ...profile, firstName: 'Maria', lastName: 'Reyes' });
});

test('existing accounts without stored name parts can edit first and last name', () => {
  const user = safeUser({ ...actor, fullName: 'Juan de la Cruz' });
  assert.equal(user.firstName, 'Juan');
  assert.equal(user.lastName, 'de la Cruz');
});
