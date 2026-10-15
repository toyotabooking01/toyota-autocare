const mongoose = require('mongoose');
const { reference } = require('./fields');
const cents = { type: Number, min: 0, validate: value => value == null || Number.isSafeInteger(value) };

const serviceItem = new mongoose.Schema({
  serviceId: reference('Service'),
  name: { type: String, required: true },
  priceCents: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
}, { _id: false });

const receiptSchema = new mongoose.Schema({
  receiptNumber: { type: String, required: true, unique: true, immutable: true, match: /^RCT-\d{4}-\d{6,}$/ },
  type: { type: String, required: true, enum: ['downpayment', 'final_payment', 'full_payment'], immutable: true },
  payment: { ...reference('Payment'), immutable: true },
  invoice: { ...reference('Invoice', false), immutable: true },
  booking: { ...reference('Booking'), immutable: true },
  client: { ...reference('User'), immutable: true },
  issuedAt: { type: Date, required: true, immutable: true },
  bookingSnapshot: { type: new mongoose.Schema({ bookingReference: { type: String, required: true } }, { _id: false }), required: true, immutable: true },
  clientSnapshot: { type: new mongoose.Schema({ fullName: { type: String, required: true }, email: { type: String, required: true } }, { _id: false }), required: true, immutable: true },
  vehicleSnapshot: { type: new mongoose.Schema({ make: String, model: String, year: Number, variant: String, plateNumber: String }, { _id: false }), required: true, immutable: true },
  serviceItems: { type: [serviceItem], required: true, immutable: true },
  financialSnapshot: { type: new mongoose.Schema({ estimatedTotalCents: Number, downpaymentRequiredCents: Number,
    amountPaidCents: Number, estimatedRemainingCents: Number }, { _id: false }), required: true, immutable: true },
  paymentSnapshot: { type: new mongoose.Schema({ method: String, reference: String, verifiedAt: Date,
    verifiedBy: String, verifiedByRole: String }, { _id: false }), required: true, immutable: true },
  settlementSnapshot: { type: new mongoose.Schema({ invoiceNumber: String,
    originalServicesTotalCents: cents, additionalWorkTotalCents: cents, finalServiceTotalCents: cents,
    verifiedDownpaymentCents: cents, verifiedFinalPaymentsCents: cents,
    thisPaymentCents: cents, totalVerifiedPaymentsCents: cents, remainingBalanceCents: cents,
    payments: [{ paymentId: reference('Payment'), stage: { type: String, enum: ['downpayment', 'final'] },
      amountCents: cents, method: String, verifiedAt: Date }],
  }, { _id: false }), immutable: true, default: undefined },
  document: { status: { type: String, enum: ['pending', 'processing', 'generated', 'failed'], default: 'pending' },
    secureUrl: String, publicId: String, bytes: Number, generatedAt: Date, processingStartedAt: Date,
    lastErrorAt: Date, lastError: String },
  emailDelivery: { status: { type: String, enum: ['pending', 'sending', 'sent', 'failed', 'suppressed'], default: 'pending' },
    sentAt: Date, lastAttemptAt: Date, lastErrorAt: Date, lastError: String },
}, { timestamps: true });

receiptSchema.index({ payment: 1, type: 1 }, { unique: true });
receiptSchema.index({ booking: 1, type: 1 }, { unique: true, partialFilterExpression: { type: 'full_payment' } });
receiptSchema.index({ booking: 1, issuedAt: -1 });
module.exports = mongoose.models.Receipt || mongoose.model('Receipt', receiptSchema);
