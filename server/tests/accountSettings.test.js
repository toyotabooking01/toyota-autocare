const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const crypto = require('node:crypto');
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
process.env.JWT_EXPIRES_IN = '1h';
const authService = require('../services/authService');
const User = require('../models/User');
const validate = require('../utils/validateForm');

const actor = { _id: new mongoose.Types.ObjectId(), role: 'client', email: 'client@example.invalid', authVersion: 0 };
const profile = { fullName: 'Juan Santos', email: actor.email, phone: '09171234567', address: 'Quezon City' };

test('account profile uses existing mobile and email rules and rejects privileged fields', async () => {
  assert.doesNotThrow(() => validate('accountProfile', profile));
  assert.throws(() => validate('accountProfile', { ...profile, email: 'broken' }), { status: 400 });
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
  assert.equal(update.change.$set.address, 'Quezon City');
  assert.equal(update.change.$set.role, undefined);
  assert.equal(result.user.address, 'Quezon City');
  assert.equal(result.accessToken, undefined);
});

