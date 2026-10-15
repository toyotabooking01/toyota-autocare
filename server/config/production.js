const { jwtConfig, otpConfig } = require('./auth');

function validateProductionConfig() {
  if (process.env.NODE_ENV !== 'production') return;
  if (!process.env.MONGO_URI || !process.env.CLIENT_ORIGIN)
    throw new Error('Missing required production configuration.');
  let origin;
  try { origin = new URL(process.env.CLIENT_ORIGIN); }
  catch { throw new Error('Invalid production CLIENT_ORIGIN.'); }
  if (origin.protocol !== 'https:' || origin.origin !== process.env.CLIENT_ORIGIN)
    throw new Error('Invalid production CLIENT_ORIGIN.');
  jwtConfig();
  otpConfig();
}

module.exports = validateProductionConfig;
