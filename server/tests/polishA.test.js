const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { validateForm } = require('../utils/formValidation.cjs');
const policy = require('../../shared/accountValidation.cjs');
const auth = require('../utils/authValidation');
const people = require('../services/peopleVehiclesService');
const User = require('../models/User');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const emailService = require('../services/emailService');
const otpService = require('../services/otpService');
const errorHandler = require('../middleware/errorHandler');
const profile = { firstName: 'Juan', lastName: 'Santos', fullName: 'Juan Santos', email: 'juan@example.invalid', phone: '09171234567', password: 'SecureJourney42!', confirmPassword: 'SecureJourney42!', termsAccepted: true };

test('shared account policy agrees across client registration, reset and mechanic creation', async () => {
  const { validateForm: clientValidate } = await import('../../client/src/utils/validationRules.js');
  for (const password of ['', 'Short1!', 'lowercaseonly1!', 'UPPERCASEONLY1!', 'NoNumbersHere!', 'NoSpecialHere42', 'Space Is Not Special42', 'SecureJourney42!', 'Aa1!' + 'a'.repeat(68), 'Aa1!' + 'a'.repeat(69), 'Aa1!' + 'é'.repeat(35)]) {
    for (const [kind, values] of [['clientRegistration', { ...profile, password, confirmPassword: password }], ['reset', { newPassword: password, confirmPassword: password }]]) {
      const options = { partial: kind === 'mechanic' };
      const errors = validateForm(kind, values, options);
      assert.deepEqual(clientValidate(kind, values, options), errors);
      assert.equal(Boolean(errors[kind === 'reset' ? 'newPassword' : 'password']), Boolean(policy.passwordError(password)));
      assert.doesNotMatch(JSON.stringify(errors), /UTF-8|bytes|bcrypt/);
    }
  }
  assert.equal(auth.credentials({ email: profile.email, password: 'legacy' }).password, 'legacy');
  assert.throws(() => people.mechanicInput({ ...profile, confirmPassword: undefined }, true));
  assert.throws(() => people.mechanicInput({ fullName: profile.fullName, email: profile.email, phone: profile.phone, employeeId: 'MECH-1' }, true), { status: 400 });
  assert.throws(() => people.mechanicInput({ fullName: profile.fullName, email: profile.email }, true), { status: 400 });
});

test('mobile rules accept only local/international PH formats and normalize identically', async () => {
  const { validateForm: clientValidate } = await import('../../client/src/utils/validationRules.js');
  for (const phone of ['09171234567', '+639171234567', ' 09171234567 ']) {
    assert.equal(auth.registration({ ...profile, phone }).phone, '+639171234567');
    assert.equal(people.mechanicInput({ phone }).phone, '+639171234567');
    assert.equal(policy.normalizeMobile(phone), '+639171234567');
  }
  for (const phone of ['0917123456', '091712345678', '+63917123456', '+6391712345678', '639171234567', '+63 917 123 4567', '0917abc4567', '08171234567', '+6309171234567']) {
    assert.equal(validateForm('register', { ...profile, phone }).phone, policy.MOBILE_HINT);
    assert.equal(clientValidate('register', { ...profile, phone }).phone, policy.MOBILE_HINT);
    assert.throws(() => people.mechanicInput({ phone }));
  }
  assert.throws(() => people.mechanicInput({ phone: '' }), { status: 400 });
});

test('registration consent is strict and its timestamp is assigned by the server', () => {
  for (const termsAccepted of [undefined, null, false, 'true', 'false', 1, {}, []]) {
    assert.throws(() => auth.registration({ ...profile, termsAccepted, termsAcceptedAt: '2000-01-01' }), error => error.errors?.termsAccepted === policy.CONSENT_HINT);
  }
  const before = Date.now();
  const result = auth.registration({ ...profile, termsAcceptedAt: '2000-01-01' });
  assert.ok(result.termsAcceptedAt.getTime() >= before);
  assert.equal(User.schema.path('termsAcceptedAt').instance, 'Date');
  assert.equal(auth.profile(profile).termsAcceptedAt, undefined, 'admin bootstrap must not fabricate client consent');
});

test('registration stores consent and normalized mobile with all database and email operations mocked', async t => {
  t.mock.method(nodemailer, 'createTransport', () => { throw new Error('Real email is forbidden in this test'); });
  t.mock.method(emailService, 'ensureConfigured', () => {});
  t.mock.method(otpService, 'createOtp', async () => ({ mocked: true }));
  const delivery = t.mock.method(otpService, 'deliver', async () => {});
  t.mock.method(User, 'exists', async () => false);
  let saved;
  t.mock.method(User, 'create', async ([input]) => { saved = input; return [{ ...input, _id: '111111111111111111111111' }]; });
  t.mock.method(mongoose.connection, 'transaction', async callback => callback({ mocked: true }));
  process.env.OTP_HASH_SECRET = randomBytes(32).toString('hex');
  process.env.OTP_EXPIRY_MINUTES = '5';
  const service = require('../services/authService');
  await assert.rejects(service.register({ ...profile, termsAccepted: false }), error => Boolean(error.errors?.termsAccepted));
  assert.equal(saved, undefined); assert.equal(delivery.mock.callCount(), 0);
  await service.register(profile);
  assert.ok(saved.termsAcceptedAt instanceof Date);
  assert.equal(saved.firstName, 'Juan'); assert.equal(saved.lastName, 'Santos'); assert.equal(saved.fullName, 'Juan Santos');
  assert.equal(saved.phone, '+639171234567');
  assert.notEqual(saved.password, profile.password);
  assert.equal(delivery.mock.callCount(), 1, 'only the stub was invoked');
});

test('structured registration names validate identically and derive fullName without breaking legacy accounts', async () => {
  const { validateForm: clientValidate } = await import('../../client/src/utils/validationRules.js');
  for (const update of [{ firstName: '' }, { lastName: ' ' }, { firstName: '123' }, { middleName: {} }, { suffix: 'VII' }, { firstName: 'a'.repeat(41) }, { middleName: 'a'.repeat(31) }]) {
    const values = { ...profile, ...update };
    const errors = validateForm('clientRegistration', values);
    assert.ok(Object.keys(errors).length);
    assert.deepEqual(clientValidate('clientRegistration', values), errors);
    assert.throws(() => auth.registration(values));
  }
  const names = auth.registration({ ...profile, firstName: ' Juan  Carlos ', middleName: 'D.', lastName: 'De la Cruz', suffix: 'Jr.', fullName: 'Ignore this name' });
  assert.equal(names.fullName, 'Juan Carlos D. De la Cruz Jr.');
  assert.equal(auth.registration(profile).fullName, 'Juan Santos');
  const legacy = new User({ fullName: 'Existing Client', email: 'legacy@example.invalid', password: '$2b$12$' + 'a'.repeat(53) });
  await legacy.validate();
  assert.equal(legacy.fullName, 'Existing Client'); assert.equal(legacy.firstName, undefined);
});

test('mobile typing/paste is cleaned and bounded; API rejects excess rather than truncating', () => {
  for (const [raw, expected] of [['09abc17 123-45678999', '09171234567'], ['+63 (917) 123-456799', '+639171234567'], ['', ''], ['09!a', '09'], ['+63++9171234567', '+639171234567']]) {
    assert.equal(policy.restrictMobileInput(raw), expected);
  }
  for (const phone of ['091712345678', '+6391712345678', '0917abc4567']) {
    assert.throws(() => auth.registration({ ...profile, phone }), error => error.errors.phone === policy.REGISTRATION_MOBILE_HINT);
  }
  assert.equal(policy.passwordRequirements('').some(rule => rule.met), false);
  assert.equal(policy.passwordRequirements(profile.password).every(rule => rule.met), true);
});

test('database validation errors never expose raw values or technical details', () => {
  let result;
  const res = { status() { return this; }, json(value) { result = value; } };
  errorHandler({ name: 'ValidationError', errors: { phone: { path: 'phone', message: 'MongoDB private value stack trace' } } }, {}, res, () => {});
  assert.equal(result.errors.phone, 'Please check your mobile number.');
  assert.doesNotMatch(JSON.stringify(result), /MongoDB|private|stack/);
});
