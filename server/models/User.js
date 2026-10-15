const mongoose = require('mongoose');
const { email, archive } = require('./fields');

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  // Optional for legacy accounts; public registration validates required name parts.
  firstName: { type: String, trim: true, maxlength: 40 },
  middleName: { type: String, trim: true, maxlength: 30 },
  lastName: { type: String, trim: true, maxlength: 40 },
  suffix: { type: String, enum: ['', 'Jr.', 'Sr.', 'II', 'III', 'IV'] },
  email: { ...email, unique: true },
  // Walk-in records keep their optional contact address separate from login identity.
  contactEmail: { type: String, trim: true, lowercase: true, maxlength: 254,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  isWalkInCustomer: { type: Boolean, default: false },
  phone: { type: String, trim: true, match: /^\+?[0-9 ()-]{7,20}$/ },
  address: { type: String, trim: true, maxlength: 300 },
  // Authentication code hashes passwords before assigning this field.
  password: { type: String, required() { return !this.isWalkInCustomer; }, select: false,
    match: /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/ },
  role: { type: String, enum: require('../config/roles').roles, default: 'client', required: true },
  emailVerified: { type: Boolean, default: false },
  mustChangePassword: { type: Boolean, default: false },
  // Short-lived, Staff-bound resend grant. No plaintext credential is retained.
  credentialDelivery: { type: new mongoose.Schema({
    staff: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    expiresAt: { type: Date, required: true }, nextAttemptAt: { type: Date, required: true },
  }, { _id: false }), select: false, default: undefined },
  // Recorded by public registration, never accepted from a client-supplied timestamp.
  termsAcceptedAt: { type: Date, default: null },
  authVersion: { type: Number, default: 0, min: 0, select: false },
  // Writing this counter serializes OTP operations for one account inside transactions.
  otpSequence: { type: Number, default: 0, min: 0, select: false },
  employeeId: {
    type: String, trim: true, uppercase: true,
    required() { return this.role === 'mechanic'; },
  },
  // Optional on legacy Staff records; required by the Admin creation flow.
  staffId: { type: String, trim: true, uppercase: true },
  specialization: { type: [String], default: [] },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  availability: { type: String, enum: ['available', 'busy', 'off_duty'], default: 'off_duty' },
  ...archive,
}, { timestamps: true });

userSchema.index({ employeeId: 1 }, {
  unique: true, partialFilterExpression: { employeeId: { $type: 'string' } },
});
userSchema.index({ staffId: 1 }, {
  unique: true, partialFilterExpression: { staffId: { $type: 'string' } },
});
userSchema.index({ contactEmail: 1 }, {
  unique: true, partialFilterExpression: { contactEmail: { $type: 'string' } },
});
userSchema.set('toJSON', {
  transform(doc, result) {
    delete result.password;
    delete result.authVersion;
    delete result.otpSequence;
    delete result.credentialDelivery;
    if (result.isWalkInCustomer) {
      result.email = result.contactEmail || '';
      delete result.contactEmail;
    }
    return result;
  },
});

module.exports = mongoose.model('User', userSchema);
