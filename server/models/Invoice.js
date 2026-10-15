const mongoose = require('mongoose');
const { reference } = require('./fields');

const cents = { type: Number, required: true, min: 0, validate: Number.isSafeInteger };
const originalItem = new mongoose.Schema({ serviceId: reference('Service', false), name: { type: String, required: true },
  priceCents: cents }, { _id: false });
const additionalItem = new mongoose.Schema({ workRequest: reference('AdditionalWorkRequest'),
  kind: { type: String, enum: ['service', 'part'], required: true }, name: { type: String, required: true },
  description: String, quantity: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  unitPriceCents: cents, lineTotalCents: cents }, { _id: false });

const schema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, unique: true, immutable: true, match: /^INV-\d{4}-\d{6,}$/ },
  type: { type: String, required: true, enum: ['final_service'], immutable: true },
  booking: { ...reference('Booking'), immutable: true },
  client: { ...reference('User'), immutable: true },
  issuedAt: { type: Date, required: true, immutable: true },
  bookingSnapshot: { type: new mongoose.Schema({ bookingReference: { type: String, required: true } }, { _id: false }), required: true, immutable: true },
  clientSnapshot: { type: new mongoose.Schema({ fullName: { type: String, required: true }, email: { type: String, required: true } }, { _id: false }), required: true, immutable: true },
  vehicleSnapshot: { type: new mongoose.Schema({ make: String, model: String, year: Number, variant: String, plateNumber: String }, { _id: false }), required: true, immutable: true },
  originalServiceItems: { type: [originalItem], required: true, immutable: true },
  additionalWorkItems: { type: [additionalItem], required: true, immutable: true },
  financialSnapshot: { type: new mongoose.Schema({ originalServicesTotalCents: cents,
    additionalWorkTotalCents: cents, finalServiceTotalCents: cents,
    verifiedDownpaymentCents: cents, otherVerifiedPaymentsCents: cents, amountDueCents: cents },
  { _id: false }), required: true, immutable: true },
  document: { status: { type: String, enum: ['pending', 'processing', 'generated', 'failed'], default: 'pending' },
    secureUrl: String, publicId: String, bytes: Number, generatedAt: Date, processingStartedAt: Date,
    lastErrorAt: Date, lastError: String },
  emailDelivery: { status: { type: String, enum: ['pending', 'sending', 'sent', 'failed'], default: 'pending' },
    sentAt: Date, lastAttemptAt: Date, lastErrorAt: Date, lastError: String },
}, { timestamps: true });
schema.index({ booking: 1, type: 1 }, { unique: true });
schema.index({ client: 1, issuedAt: -1 });
module.exports = mongoose.models.Invoice || mongoose.model('Invoice', schema);
