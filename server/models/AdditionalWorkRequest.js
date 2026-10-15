const mongoose = require('mongoose');
const { reference } = require('./fields');

const itemSchema = new mongoose.Schema({
  kind: { type: String, enum: ['service', 'part'], required: true },
  serviceId: reference('Service', false),
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  quantity: { type: Number, required: true, min: 1, max: 1000, validate: Number.isSafeInteger },
  // Original proposals have no price; quoted and approved items retain their locked prices.
  unitPriceCents: { type: Number, min: 0, validate: value => value == null || Number.isSafeInteger(value) },
  lineTotalCents: { type: Number, min: 0, validate: value => value == null || Number.isSafeInteger(value) },
}, { _id: false });

const imageSchema = new mongoose.Schema({
  secureUrl: { type: String, required: true, match: /^https:\/\// },
  publicId: { type: String, required: true },
  width: { type: Number, required: true, min: 1 },
  height: { type: Number, required: true, min: 1 },
  format: { type: String, enum: ['jpg', 'jpeg', 'png', 'webp'], required: true },
  bytes: { type: Number, required: true, min: 1 },
}, { _id: false });

const activitySchema = new mongoose.Schema({
  action: { type: String, enum: ['created', 'staff_reviewed', 'sent_to_client', 'staff_rejected', 'client_approved',
    'client_declined', 'performed', 'cancelled'], required: true },
  actor: reference('User'),
  actorRole: { type: String, enum: ['mechanic', 'staff', 'admin', 'client'], required: true },
  at: { type: Date, required: true },
}, { _id: false });

const schema = new mongoose.Schema({
  booking: reference('Booking'),
  jobOrder: reference('JobOrder'),
  client: reference('User'),
  vehicle: reference('Vehicle'),
  vehicleSummary: { type: String, trim: true, maxlength: 220, immutable: true },
  assignedMechanic: reference('User'),
  proposedBy: reference('User'),
  proposedByRole: { type: String, enum: ['mechanic', 'admin'], required: true },
  status: { type: String, enum: ['pending_staff_review', 'pending_client_approval', 'approved',
    'declined', 'performed', 'staff_rejected', 'cancelled'], required: true, default: 'pending_staff_review' },
  issueTitle: { type: String, required: true, trim: true, minlength: 5, maxlength: 120, immutable: true },
  issueDescription: { type: String, required: true, trim: true, minlength: 15, maxlength: 2000, immutable: true },
  evidenceImage: { type: imageSchema, immutable: true, default: undefined },
  originalProposalItems: { type: [itemSchema], required: true, immutable: true },
  originalProposalTotalCents: { type: Number, min: 0, immutable: true },
  quotedItems: { type: [itemSchema], default: undefined },
  quoteTotalCents: { type: Number, min: 0, validate: value => value == null || Number.isSafeInteger(value) },
  reviewedBy: reference('User', false),
  reviewedByRole: { type: String, enum: ['staff', 'admin'] },
  reviewedAt: Date,
  clientDecision: { type: String, enum: ['approved', 'declined'] },
  clientDecisionAt: Date,
  clientDecisionBy: reference('User', false),
  declineReason: { type: String, trim: true, maxlength: 300 },
  // Set once by the pending_client_approval -> approved transition; no edit route exists.
  approvedItems: { type: [itemSchema], default: undefined },
  approvedTotalCents: { type: Number, min: 0, validate: value => value == null || Number.isSafeInteger(value) },
  performedAt: Date,
  performedBy: reference('User', false),
  performedByRole: { type: String, enum: ['mechanic', 'admin'] },
  activity: { type: [activitySchema], default: [] },
}, { timestamps: true });

schema.index({ booking: 1, createdAt: -1 });
schema.index({ jobOrder: 1, status: 1 });
module.exports = mongoose.models.AdditionalWorkRequest || mongoose.model('AdditionalWorkRequest', schema);
