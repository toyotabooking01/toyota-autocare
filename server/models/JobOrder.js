const mongoose = require('mongoose');
const { reference } = require('./fields');

const checklistItemSchema = new mongoose.Schema({
  serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', default: null },
  serviceName: { type: String, trim: true, maxlength: 120, default: '' },
  description: { type: String, required: true, trim: true, maxlength: 500 },
  isCompleted: { type: Boolean, default: false },
}, { _id: false });

const jobOrderSchema = new mongoose.Schema({
  booking: { ...reference('Booking'), unique: true },
  mechanic: reference('User'),
  serviceBay: reference('ServiceBay'),
  reservedStartAt: Date,
  reservedEndAt: Date,
  estimatedDurationMinutes: { type: Number, min: 1, validate: value => value == null || Number.isInteger(value) },
  actualDurationMinutes: { type: Number, min: 1, validate: value => value == null || Number.isInteger(value) },
  customerConcern: { type: String, trim: true, maxlength: 3000, default: '' },
  checklistRequired: { type: Boolean, default: false },
  serviceChecklist: { type: [checklistItemSchema], default: [] },
  mechanicNotes: { type: String, trim: true, maxlength: 5000, default: '' },
  startedAt: Date,
  completedAt: {
    type: Date,
    validate: {
      validator(value) { return !value || Boolean(this.startedAt && value >= this.startedAt); },
      message: 'Completion requires a start time and cannot precede it.',
    },
  },
  status: { type: String, enum: ['pending', 'in_progress', 'completed', 'cancelled'], default: 'pending' },
}, { timestamps: true });

jobOrderSchema.pre('validate', function () {
  const hasStart = this.reservedStartAt != null;
  const hasEnd = this.reservedEndAt != null;
  if (hasStart !== hasEnd) this.invalidate('reservedEndAt', 'Reservation needs both start and end times.');
  else if (hasStart && this.reservedEndAt <= this.reservedStartAt) this.invalidate('reservedEndAt', 'Reservation end must follow its start.');
});

module.exports = mongoose.model('JobOrder', jobOrderSchema);
