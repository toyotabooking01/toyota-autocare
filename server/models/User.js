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
  phone: { type: String, trim: true, match: /^\+?[0-9 ()-]{7,20}$/ },
  // Authentication code hashes passwords before assigning this field.
  password: { type: String, required: true, select: false, match: /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/ },
  role: { type: String, enum: ['client', 'mechanic', 'admin'], default: 'client', required: true },
  emailVerified: { type: Boolean, default: false },
  mustChangePassword: { type: Boolean, default: false },
  // Recorded by public registration, never accepted from a client-supplied timestamp.
  termsAcceptedAt: { type: Date, default: null },
  authVersion: { type: Number, default: 0, min: 0, select: false },
  // Writing this counter serializes OTP operations for one account inside transactions.
  otpSequence: { type: Number, default: 0, min: 0, select: false },
  employeeId: {
    type: String, trim: true, uppercase: true,
    required() { return this.role === 'mechanic'; },
  },
  specialization: { type: [String], default: [] },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  availability: { type: String, enum: ['available', 'busy', 'off_duty'], default: 'off_duty' },
  ...archive,
}, { timestamps: true });

userSchema.index({ employeeId: 1 }, {
  unique: true, partialFilterExpression: { employeeId: { $type: 'string' } },
});
userSchema.set('toJSON', {
  transform(doc, result) {
    delete result.password;
    delete result.authVersion;
    delete result.otpSequence;
    return result;
  },
});

module.exports = mongoose.model('User', userSchema);
