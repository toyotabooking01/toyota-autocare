const nodemailer = require('nodemailer');
const HttpError = require('../utils/HttpError');
const emailDiagnostic = require('../utils/emailDiagnostics');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { emailDeliveryEnabled } = require('../config/emailBehavior');

function reportTransport(transport, config) {
  if (process.env.NODE_ENV === 'production' || process.env.EMAIL_DIAGNOSTICS !== 'true') return;
  const envFile = path.join(__dirname, '../.env');
  let fileConfig = {};
  try { fileConfig = dotenv.parse(fs.readFileSync(envFile)); } catch { /* Report mismatch if unreadable. */ }
  const login = String(config.user);
  const at = login.lastIndexOf('@');
  emailDiagnostic('runtimeTransport', null, {
    transportType: transport.transporter?.name || 'unknown',
    smtpHost: config.host, smtpPort: config.port,
    maskedLogin: at >= 0 ? login.slice(0, 2) + '***' + login.slice(at) : login.slice(0, 2) + '***',
    envFile, runtimeKeyMatchesEnvFile: config.pass === fileConfig.BREVO_SMTP_PASS,
    runtimeLoginMatchesEnvFile: config.user === fileConfig.BREVO_SMTP_USER,
    processId: process.pid, timestampUtc: new Date().toISOString(),
  });
}

function configuration() {
  if (!emailDeliveryEnabled()) {
    throw new HttpError(503, 'Email delivery is currently disabled.');
  }
  const host = process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com';
  const port = Number(process.env.BREVO_SMTP_PORT || 587);
  const user = process.env.BREVO_SMTP_USER;
  const pass = process.env.BREVO_SMTP_PASS;
  const from = process.env.EMAIL_FROM;
  if (!user || !pass || !from || /[\r\n]/.test(from) || ![587, 465, 2525].includes(port)) {
    throw new HttpError(503, 'Email delivery is not configured.');
  }
  return { host, port, user, pass, from };
}

function ensureConfigured() { configuration(); }

async function sendEmail({ to, subject, text, html }) {
  emailDiagnostic('emailServiceCalled');
  const config = configuration();
  const transport = nodemailer.createTransport({
    host: config.host, port: config.port, secure: config.port === 465,
    requireTLS: true, auth: { user: config.user, pass: config.pass },
    tls: { minVersion: 'TLSv1.2' },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    logger: false, debug: false,
  });
  try {
    reportTransport(transport, config);
    emailDiagnostic('sendMailStarted');
    const result = await transport.sendMail({ from: config.from, to: { address: to }, subject, text, html });
    const response = typeof result.response === 'string' ? result.response : '';
    emailDiagnostic(result.accepted?.length ? 'smtpAccepted' : 'smtpNotAccepted', null, {
      messageId: result.messageId, acceptedCount: result.accepted?.length || 0,
      rejectedCount: result.rejected?.length || 0,
      smtpCode: /^\d{3}\b/.exec(response)?.[0],
      smtpReplyClass: /queued/i.test(response) ? 'QUEUED' : 'OTHER',
      processId: process.pid, timestampUtc: new Date().toISOString(),
    });
    if (!result.accepted?.length) throw new Error('Message was not accepted');
  } catch (error) {
    emailDiagnostic('sendMailFailed', error);
    throw new HttpError(503, 'Email delivery is temporarily unavailable. Please try again.');
  } finally {
    transport.close();
  }
}

async function sendOtp({ email, code, purpose, minutes }) {
  const title = purpose === 'email_verification' ? 'Verify your email' : 'Reset your password';
  await module.exports.sendEmail({
    to: email,
    subject: `Toyota AutoCare — ${title}`,
    text: `Toyota AutoCare\n${title}\nYour code is ${code}. It expires in ${minutes} minutes.\nIf you did not request this, ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;color:#242424;max-width:480px;padding:24px">
      <h2 style="color:#eb0a1e">Toyota AutoCare</h2><h3>${title}</h3>
      <p>Your verification code:</p><p style="font-size:30px;letter-spacing:6px">${code}</p>
      <p>Expires in ${minutes} minutes.</p><p>If you did not request this, ignore this email.</p></div>`,
  });
}
module.exports = { ensureConfigured, sendEmail, sendOtp };
