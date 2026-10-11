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
    envFile, runtimeKeyMatchesEnvFile: config.pass === fileConfig.SMTP_PASS,
    runtimeLoginMatchesEnvFile: config.user === fileConfig.SMTP_USER,
    processId: process.pid, timestampUtc: new Date().toISOString(),
  });
}

function configuration() {
  if (!emailDeliveryEnabled()) {
    throw new HttpError(503, 'Email delivery is currently disabled.');
  }
  const host = process.env.SMTP_HOST?.trim();
  const portText = process.env.SMTP_PORT?.trim() || '';
  const port = Number(portText);
  const secureText = process.env.SMTP_SECURE?.trim().toLowerCase();
  const secure = secureText === 'true';
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM;
  if (!host || /[\s/]/.test(host) || !user || !pass?.trim() || !from?.trim() || /[\r\n]/.test(from)
    || !/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535
    || !['true', 'false'].includes(secureText)) {
    throw new HttpError(503, 'Email delivery is not configured.');
  }
  return { host, port, secure, user, pass, from };
}

function ensureConfigured() { configuration(); }

async function sendEmail({ to, subject, text, html }) {
  emailDiagnostic('emailServiceCalled');
  const config = configuration();
  const transport = nodemailer.createTransport({
    host: config.host, port: config.port, secure: config.secure,
    requireTLS: !config.secure, auth: { user: config.user, pass: config.pass },
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
async function sendTemporaryPassword({ email, password, accountType = 'client' }) {
  const isMechanic = accountType === 'mechanic';
  const subject = isMechanic ? 'Toyota AutoCare - Your mechanic account sign-in details'
    : 'Toyota AutoCare - Your temporary sign-in details';
  const title = isMechanic ? 'Your mechanic account sign-in details' : 'Your temporary sign-in details';
  const accountDescription = isMechanic
    ? 'A mechanic account was created for you at Toyota AutoCare.'
    : 'An account was created for your walk-in service visit.';
  const safeEmail = String(email).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
  const safePassword = String(password).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
  await module.exports.sendEmail({
    to: email,
    subject,
    text: `Toyota AutoCare\n\n${title}\n\n${accountDescription}\n\nEmail\n${email}\n\nTemporary Password\n${password}\n\nYou’ll be required to change this password after your first sign-in.\n\nSecurity note: Keep this temporary password private. If you did not request this account, contact the Toyota AutoCare service desk.`,
    html: `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px 12px;background:#f3f5f7;font-family:Arial,Helvetica,sans-serif;color:#202833;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your Toyota AutoCare temporary sign-in details.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e1e6eb;border-radius:12px;">
      <tr><td style="padding:24px 28px 0;">
        <div style="font-size:21px;line-height:1.3;font-weight:700;letter-spacing:-.3px;color:#192536;">Toyota <span style="color:#eb0a1e;">AutoCare</span></div>
        <div style="height:3px;width:42px;margin:18px 0 22px;background:#eb0a1e;border-radius:2px;"></div>
        <h1 style="margin:0 0 12px;font-size:23px;line-height:1.3;color:#192536;">${title}</h1>
        <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#4b5968;">${accountDescription}</p>
        <div style="margin:0 0 18px;padding:14px 16px;background:#f6f8fa;border:1px solid #e6eaee;border-radius:8px;">
          <div style="margin-bottom:5px;font-size:12px;line-height:1.4;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#647284;">Email</div>
          <div style="font-size:15px;line-height:1.5;color:#202833;overflow-wrap:anywhere;word-break:break-word;">${safeEmail}</div>
        </div>
        <div style="margin:0 0 8px;font-size:12px;line-height:1.4;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#647284;">Temporary Password</div>
        <div style="margin:0 0 20px;padding:18px 16px;background:#fff1f2;border:1px solid #f0b8bf;border-radius:8px;color:#b20b1e;font-family:'Courier New',Courier,monospace;font-size:24px;line-height:1.45;font-weight:700;letter-spacing:.5px;overflow-wrap:anywhere;word-break:break-all;">${safePassword}</div>
        <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#354253;">You’ll be required to change this password after your first sign-in.</p>
        <div style="margin:0 0 24px;padding:14px 16px;border-left:3px solid #eb0a1e;background:#fafbfc;font-size:13px;line-height:1.6;color:#566374;">
          <strong style="color:#354253;">Security note:</strong> Keep this temporary password private. If you did not request this account, contact the Toyota AutoCare service desk.
        </div>
      </td></tr>
      <tr><td style="padding:16px 28px 22px;border-top:1px solid #e8ecef;font-size:12px;line-height:1.5;color:#778391;">Toyota AutoCare · Expert service. Genuine care.</td></tr>
    </table>
  </body>
</html>`,
  });
}
module.exports = { ensureConfigured, sendEmail, sendOtp, sendTemporaryPassword };
