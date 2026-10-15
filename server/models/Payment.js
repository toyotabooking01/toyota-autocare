const mongoose = require('mongoose');
const { reference } = require('./fields');

const paymentSchema = new mongoose.Schema({
  booking: reference('Booking'),
  client: reference('User'),
  stage: { type: String, enum: ['downpayment', 'final'], required: true },
  amountCents: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  method: { type: String, enum: ['cash', 'bank_transfer', 'gcash', 'maya', 'no_charge'], required: true },
  reference: { type: String, trim: true, maxlength: 120, default: '' },
  proof: { type: String, trim: true, maxlength: 500, default: '' },
  status: { type: String, enum: ['submitted', 'verified', 'rejected'], default: 'submitted' },
  submittedBy: reference('User'),
  verifiedBy: reference('User', false),
  verifiedByRole: { type: String, enum: ['staff', 'admin'] },
  verifiedAt: Date,
  rejectedBy: reference('User', false),
  rejectedAt: Date,
}, { timestamps: true });

paymentSchema.index({ booking: 1, stage: 1, status: 1 });
paymentSchema.index({ booking: 1, stage: 1 }, { unique: true, partialFilterExpression: { status: 'submitted' } });
module.exports = mongoose.model('Payment', paymentSchema);
