const HttpError = require('../utils/HttpError');

// Single-process development limiter. Persistent OTP attempts/cooldowns live in MongoDB.
function rateLimit({ limit, windowMs }) {
  const buckets = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip; // Express trust proxy stays disabled; spoofed forwarding headers are ignored.
    for (const [ip, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(ip);
    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= 10000) return next(new HttpError(429, 'Too many requests. Try again later.'));
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > limit) {
      res.set('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return next(new HttpError(429, 'Too many requests. Try again later.'));
    }
    next();
  };
}
module.exports = rateLimit;
