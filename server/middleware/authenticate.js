const mongoose = require('mongoose');
const User = require('../models/User');
const HttpError = require('../utils/HttpError');
const { verifyAccessToken } = require('../services/tokenService');

async function authenticate(req, res, next, allowPasswordChange = false) {
  try {
    const match = /^Bearer ([^\s]+)$/i.exec(req.get('Authorization') || '');
    if (!match) throw new HttpError(401, 'Authentication required.');
    let payload;
    try { payload = verifyAccessToken(match[1]); }
    catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(401, 'Invalid or expired access token.');
    }
    if (payload.tokenUse !== 'access' || !mongoose.isObjectIdOrHexString(payload.sub)
      || !Number.isInteger(payload.version)) throw new HttpError(401, 'Invalid or expired access token.');
    const user = await User.findById(payload.sub).select('+authVersion');
    if (!user || !['client', 'mechanic', 'admin'].includes(user.role) || payload.role !== user.role
      || user.isArchived || user.status !== 'active'
      || (user.role === 'client' && !user.emailVerified) || (user.authVersion || 0) !== payload.version) {
      throw new HttpError(401, 'Invalid or expired access token.');
    }
    if (user.mustChangePassword && !allowPasswordChange) {
      throw new HttpError(403, 'Please change your temporary password before continuing.');
    }
    req.user = user; // Authorization uses the current database role, not the JWT role.
    next();
  } catch (error) { next(error); }
}
module.exports = authenticate;
module.exports.passwordChangeAccess = (req, res, next) => authenticate(req, res, next, true);
