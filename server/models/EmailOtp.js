const mongoose = require('mongoose');
const { email, nonNegativeInteger } = require('./fields');

const emailOtpSchema = new mongoose.Schema({
  email: { ...email },
  // Keyed SHA-256 digests only, never plaintext OTPs or reset tokens.
  otpHash: { type: String, required: true, select: false, match: /^[a-f0-9]{64}$/ },
  purpose: { type: String, enum: ['email_verification', 'password_reset'], required: true },
  expiresAt: { type: Date, required: true },
  attempts: { ...nonNegativeInteger },
  isUsed: { type: Boolean, default: false },
  resetTokenHash: { type: String, select: false, match: /^[a-f0-9]{64}$/ },
}, { timestamps: true });

emailOtpSchema.index({ email: 1, purpose: 1 });
emailOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
emailOtpSchema.set('toJSON', {
  transform(doc, result) { delete result.otpHash; delete result.resetTokenHash; return result; },
});

module.exports = mongoose.model('EmailOtp', emailOtpSchema);
