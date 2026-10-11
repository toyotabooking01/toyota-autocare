const crypto = require('node:crypto');

// 192 random bits plus guaranteed characters for the shared password policy.
module.exports = function temporaryPassword() {
  return `${crypto.randomBytes(24).toString('base64url')}Aa1!`;
};
