const HttpError = require('../utils/HttpError');

function authorize(...roles) {
  if (!roles.length || roles.some(role => !['client', 'mechanic', 'admin'].includes(role))) {
    throw new Error('Authorization middleware requires approved roles.');
  }
  return (req, res, next) => {
    if (!req.user) return next(new HttpError(401, 'Authentication required.'));
    if (!roles.includes(req.user.role)) return next(new HttpError(403, 'Access denied.'));
    next();
  };
}
module.exports = authorize;
