const { test } = require('node:test');
const assert = require('node:assert/strict');
const emailDiagnostic = require('../utils/emailDiagnostics');

test('Email diagnostics are opt-in, disabled in production, and never serialize raw errors', t => {
  const previousFlag = process.env.EMAIL_DIAGNOSTICS;
  const previousEnvironment = process.env.NODE_ENV;
  const logs = [];
  t.mock.method(console, 'info', (...args) => logs.push(args.join(' ')));
  try {
    delete process.env.EMAIL_DIAGNOSTICS;
    process.env.NODE_ENV = 'development';
    emailDiagnostic('sendMailStarted');
    assert.equal(logs.length, 0);
    process.env.EMAIL_DIAGNOSTICS = 'true';
    const error = Object.assign(new Error('private password OTP credential'), {
      code: 'EAUTH', responseCode: 450,
      response: 'Your sending platform is currently disabled. private recipient and SMTP key',
      envelope: { to: ['private@example.invalid'] },
    });
    emailDiagnostic('sendMailFailed', error);
    assert.equal(logs.length, 1);
    const output = JSON.parse(logs[0].replace('[email-diagnostic] ', ''));
    assert.deepEqual(output, { event: 'sendMailFailed', smtpError: 'EAUTH',
      smtpResponseCode: 450, condition: 'BREVO_PLATFORM_DISABLED' });
    assert.ok(!logs[0].includes('private'));
    emailDiagnostic('runtimeTransport', null, {
      transportType: 'SMTP', smtpHost: 'smtp-relay.brevo.com', smtpPort: 587,
      maskedLogin: 'bc***@smtp-brevo.com', runtimeKeyMatchesEnvFile: true,
      pass: 'private-key', auth: { pass: 'private-key' }, otp: 'private-code',
      response: 'private raw response',
    });
    assert.deepEqual(JSON.parse(logs[1].replace('[email-diagnostic] ', '')), {
      event: 'runtimeTransport', transportType: 'SMTP', smtpHost: 'smtp-relay.brevo.com',
      smtpPort: 587, maskedLogin: 'bc***@smtp-brevo.com', runtimeKeyMatchesEnvFile: true,
    });
    process.env.NODE_ENV = 'production';
    emailDiagnostic('sendMailFailed', error);
    assert.equal(logs.length, 2);
  } finally {
    if (previousFlag === undefined) delete process.env.EMAIL_DIAGNOSTICS;
    else process.env.EMAIL_DIAGNOSTICS = previousFlag;
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
  }
});
