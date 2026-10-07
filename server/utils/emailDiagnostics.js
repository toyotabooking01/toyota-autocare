// Opt-in local diagnostics. Never serialize an Error, message, envelope or SMTP response.
function emailDiagnostic(event, error, details = {}) {
  if (process.env.NODE_ENV === 'production' || process.env.EMAIL_DIAGNOSTICS !== 'true') return;
  const codes = ['EAUTH', 'ECONNECTION', 'ESOCKET', 'ETIMEDOUT', 'EDNS', 'EENVELOPE', 'EMESSAGE',
    'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETLS'];
  const result = { event };
  // Callers supply only selected transport metadata, never whole options/results.
  for (const key of ['transportType', 'smtpHost', 'smtpPort', 'maskedLogin', 'messageId',
    'acceptedCount', 'rejectedCount', 'smtpCode', 'smtpReplyClass', 'envFile',
    'runtimeKeyMatchesEnvFile', 'runtimeLoginMatchesEnvFile', 'processId', 'timestampUtc']) {
    if (details[key] !== undefined) result[key] = details[key];
  }
  if (error) {
    result.smtpError = codes.includes(error.code) ? error.code : 'UNCLASSIFIED';
    if (Number.isInteger(error.responseCode) && error.responseCode >= 400 && error.responseCode <= 599) {
      result.smtpResponseCode = error.responseCode;
    }
    const response = typeof error.response === 'string' ? error.response.toLowerCase() : '';
    if (response.includes('sending platform is currently disabled')) result.condition = 'BREVO_PLATFORM_DISABLED';
    else if (response.includes('account is not yet activated')) result.condition = 'BREVO_ACCOUNT_NOT_ACTIVATED';
  }
  console.info('[email-diagnostic]', JSON.stringify(result));
}
module.exports = emailDiagnostic;
