const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const email = require('../services/emailService');
const fs = require('node:fs');

const settings = { SMTP_HOST: 'in-v3.mailjet.com', SMTP_PORT: '465', SMTP_SECURE: 'true',
  SMTP_USER: 'mailjet-api-key', SMTP_PASS: 'mailjet-secret-key', EMAIL_FROM: 'Toyota AutoCare <verified@example.invalid>',
  EMAIL_DELIVERY_ENABLED: 'true', EMAIL_DIAGNOSTICS: 'false', NODE_ENV: 'test' };
beforeEach(t => {
  const previous = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  Object.assign(process.env, settings);
  t.after(() => { for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  } });
  // Every test forbids the real transport, including tests that fail before sending.
  t.mock.method(nodemailer, 'createTransport', () => { throw new Error('Live SMTP is forbidden in tests'); });
});
function transport(t, fail = false) {
  const calls = []; let options; let closed = 0;
  t.mock.method(nodemailer, 'createTransport', value => {
    options = value;
    return { transporter: { name: 'SMTP' }, close() { closed++; }, async sendMail(mail) {
      calls.push(mail);
      if (fail) throw Object.assign(new Error('test-only-api-key secret OTP=012345 temporary-secret'), { code: 'EAUTH' });
      return { accepted: [mail.to.address], response: '250 queued' };
    } };
  });
  return { calls, options: () => options, closed: () => closed };
}
test('Mailjet SMTP settings configure transport and preserve all email templates', async t => {
  const fixture = transport(t);
  for (const purpose of ['email_verification', 'email_verification', 'password_reset']) {
    await email.sendOtp({ email: 'test@example.invalid', code: '012345', minutes: 5, purpose });
  }
  await email.sendTemporaryPassword({ email: 'test@example.invalid', password: 'Temp<&Password1!' });
  const options = fixture.options();
  assert.equal(options.host, 'in-v3.mailjet.com'); assert.equal(options.port, 465); assert.equal(options.secure, true);
  assert.deepEqual(options.auth, { user: 'mailjet-api-key', pass: settings.SMTP_PASS });
  assert.equal(options.requireTLS, false); assert.equal(options.tls.minVersion, 'TLSv1.2');
  assert.equal(options.logger, false); assert.equal(options.debug, false);
  assert.equal(fixture.calls.length, 4); assert.equal(fixture.closed(), 4);
  for (const mail of fixture.calls) assert.equal(mail.from, settings.EMAIL_FROM);
  assert.match(fixture.calls[0].html, /012345/); assert.match(fixture.calls[2].subject, /Reset your password/);
  const temporaryPasswordMail = fixture.calls[3];
  assert.equal(temporaryPasswordMail.subject, 'Toyota AutoCare Client Account');
  assert.match(temporaryPasswordMail.text, /Your account has been created for your Walk-In service visit\./);
  assert.match(temporaryPasswordMail.text, /Temporary Password\nTemp<&Password1!/);
  assert.match(temporaryPasswordMail.html, /Temporary Password/);
  assert.match(temporaryPasswordMail.html, /background:#fff1f2/);
  assert.match(temporaryPasswordMail.html, /font-family:'Courier New',Courier,monospace/);
  assert.match(temporaryPasswordMail.html, /Temp&lt;&amp;Password1!/);
  assert.match(temporaryPasswordMail.html, /create a new password when you sign in for the first time/);
});
test('false is a boolean false and requires STARTTLS on port 587', async t => {
  process.env.SMTP_SECURE = 'false'; process.env.SMTP_PORT = '587';
  const fixture = transport(t);
  await email.sendEmail({ to: 'test@example.invalid', subject: 'Fixture', text: 'Fixture' });
  assert.equal(fixture.options().secure, false); assert.equal(fixture.options().requireTLS, true);
});
test('mechanic credential email uses its subject and the shared branded password card', async t => {
  const fixture = transport(t);
  await email.sendTemporaryPassword({ email: 'mechanic@example.invalid', password: 'mechanic-temporary', accountType: 'mechanic' });
  const [mail] = fixture.calls;
  assert.equal(mail.subject, 'Toyota AutoCare - Your mechanic account sign-in details');
  assert.match(mail.text, /A mechanic account was created for you/);
  assert.match(mail.html, /Your mechanic account sign-in details/);
  assert.match(mail.html, /mechanic@example\.invalid/);
  assert.match(mail.html, /background:#fff1f2/);
  assert.match(mail.html, /mechanic-temporary/);
  assert.match(mail.html, /change this password after your first sign-in/);
});
test('Staff credential email includes Staff ID and first-login instructions', async t => {
  const fixture = transport(t);
  await email.sendTemporaryPassword({ email: 'staff@example.invalid', password: 'Temp<&Staff42!',
    accountType: 'staff', firstName: 'Maria', staffId: 'STAFF-1001' });
  const [mail] = fixture.calls;
  assert.equal(mail.subject, 'Your Toyota AutoCare Staff Account');
  assert.match(mail.text, /Hello Maria/);
  assert.match(mail.text, /Staff ID:\nSTAFF-1001/);
  assert.match(mail.text, /Temporary Password:\nTemp<&Staff42!/);
  assert.match(mail.text, /required to create a new password/);
  assert.match(mail.html, /Temp&lt;&amp;Staff42!/);
  assert.match(mail.html, /STAFF-1001/);
});
test('missing or malformed generic SMTP settings fail with a friendly configuration error', () => {
  for (const [key, values] of Object.entries({ SMTP_HOST: ['', 'smtp://bad'], SMTP_PORT: ['', 'abc', '0', '65536', '465.5'],
    SMTP_SECURE: ['', 'yes', '0'], SMTP_USER: [''], SMTP_PASS: ['', ' '], EMAIL_FROM: ['', 'sender\r\nInjected: value'] })) {
    for (const value of values) {
      process.env[key] = value;
      assert.throws(() => email.ensureConfigured(), { status: 503, message: 'Email delivery is not configured.' });
    }
    process.env[key] = settings[key];
  }
  delete process.env.SMTP_PASS;
  assert.throws(() => email.ensureConfigured(), { status: 503 });
});
test('disabled delivery blocks OTP and temporary-password messages before transport creation', async t => {
  process.env.EMAIL_DELIVERY_ENABLED = 'false';
  const fixture = transport(t);
  await assert.rejects(email.sendOtp({ email: 'test@example.invalid', code: '012345', purpose: 'email_verification', minutes: 5 }), { status: 503 });
  await assert.rejects(email.sendTemporaryPassword({ email: 'test@example.invalid', password: 'temporary-secret' }), { status: 503 });
  assert.equal(fixture.options(), undefined); assert.equal(fixture.calls.length, 0);
});
test('enabled diagnostics compare generic SMTP variables and never expose message secrets', async t => {
  process.env.EMAIL_DIAGNOSTICS = 'true';
  const logs = [];
  t.mock.method(console, 'info', (...args) => logs.push(args.join(' ')));
  t.mock.method(fs, 'readFileSync', () => 'SMTP_USER=mailjet-api-key\nSMTP_PASS=mailjet-secret-key');
  const fixture = transport(t, true);
  await assert.rejects(email.sendTemporaryPassword({ email: 'test@example.invalid', password: 'temporary-secret' }),
    { status: 503, message: 'Email delivery is temporarily unavailable. Please try again.' });
  const runtime = logs.find(value => value.includes('runtimeTransport'));
  assert.match(runtime, /"runtimeKeyMatchesEnvFile":true/);
  assert.match(runtime, /"runtimeLoginMatchesEnvFile":true/);
  assert.doesNotMatch(logs.join(' '), /mailjet-secret-key|012345|temporary-secret/);
  assert.equal(fixture.closed(), 1);
});
