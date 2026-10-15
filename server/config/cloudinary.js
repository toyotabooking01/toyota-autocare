const { v2: cloudinary } = require('cloudinary');
const HttpError = require('../utils/HttpError');

function ensureConfigured() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloudName || !apiKey || !apiSecret) {
    throw new HttpError(503, 'Cloudinary configuration is incomplete.');
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  return cloudinary;
}

module.exports = { cloudinary, ensureConfigured };
