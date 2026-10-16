const initializeApp = require('../config/initializeApp');
const HttpError = require('../utils/HttpError');

module.exports = async function initializeServerless(req, res, next) {
  try {
    await initializeApp();
    next();
  } catch {
    // Never expose connection strings, driver errors, or configuration values.
    next(new HttpError(503, 'Authentication is temporarily unavailable.'));
  }
};
