const jwt = require('jsonwebtoken');
const { jwtConfig } = require('../config/auth');

function signAccessToken(user) {
  const config = jwtConfig();
  return jwt.sign({ role: user.role, version: user.authVersion || 0, tokenUse: 'access' }, config.secret, {
    algorithm: 'HS256', subject: String(user._id), expiresIn: config.seconds,
    issuer: config.issuer, audience: config.audience,
  });
}
function verifyAccessToken(token) {
  const config = jwtConfig();
  return jwt.verify(token, config.secret, {
    algorithms: ['HS256'], issuer: config.issuer, audience: config.audience,
  });
}
module.exports = { signAccessToken, verifyAccessToken };
