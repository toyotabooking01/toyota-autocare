const mongoose = require('mongoose');
const { reference, calendarDate, timeSlot } = require('./fields');

const bookingSchema = new mongoose.Schema({
  client: reference('User'),
  vehicle: reference('Vehicle'),
  services: {
    type: [reference('Service')],
    required: true,
    default: undefined,
    castNonArrays: false,
    validate: {
      validator(values) {
        return Array.isArray(values) && values.length > 0 && values.every(Boolean)
          && new Set(values.map(String)).size === values.length;
      },
      message: 'Select at least one service, without duplicates or empty references.',
    },
  },
  schedule: reference('Schedule'),
  assignedMechanic: reference('User', false),
  assignedServiceBay: reference('ServiceBay', false),
  bookingDate: { ...calendarDate },
  bookingTime: { ...timeSlot },
  bookingType: { type: String, enum: ['online', 'walk-in'], required: true },
  createdByStaff: reference('User', false),
  createdByRole: { type: String, enum: ['staff', 'admin'] },
  lastProcessedBy: reference('User', false),
  lastProcessedByRole: { type: String, enum: ['staff', 'mechanic', 'admin'] },
  lastProcessedAt: Date,
  activity: [{
    action: { type: String, required: true },
    performedBy: reference('User'),
    performedByRole: { type: String, enum: ['client', 'staff', 'mechanic', 'admin'], required: true },
    performedAt: { type: Date, required: true },
  }],
  estimatedDurationMinutes: { type: Number, min: 1, validate: value => value == null || Number.isInteger(value) },
  initialEstimatedDurationMinutes: { type: Number, min: 1, validate: value => value == null || Number.isInteger(value) },
  durationHistory: [{
    previousDurationMinutes: { type: Number, required: true, min: 1 },
    newDurationMinutes: { type: Number, required: true, min: 1 },
    changedAt: { type: Date, required: true },
    changedBy: reference('User'),
    changedByRole: { type: String, enum: ['staff', 'mechanic', 'admin'] },
  }],
  actualDurationMinutes: { type: Number, min: 1, validate: value => value == null || Number.isInteger(value) },
  reservedStartAt: Date,
  reservedEndAt: Date,
  concern: { type: String, trim: true, maxlength: 3000, default: '' },
  notes: { type: String, trim: true, maxlength: 5000, default: '' },
  estimatedCompletion: Date,
  serviceMileage: { type: Number, min: 0, max: 9999999, validate: value => value == null || Number.isSafeInteger(value) },
  finalTotalCents: { type: Number, min: 0, validate: value => value == null || Number.isSafeInteger(value) },
  originalServicesTotalCents: { type: Number, min: 0, validate: value => value == null || Number.isSafeInteger(value) },
  additionalWorkTotalCents: { type: Number, min: 0, validate: value => value == null || Number.isSafeInteger(value) },
  finalBillingLockedAt: Date,
  estimatedTotalCents: { type: Number, min: 0, validate: value => value == null || Number.isSafeInteger(value) },
  estimatedServiceItems: [{ serviceId: reference('Service'), name: String,
    priceCents: { type: Number, min: 0, validate: Number.isSafeInteger } }],
  downpaymentRequiredCents: { type: Number, min: 0, validate: value => value == null || Number.isSafeInteger(value) },
  holdStartedAt: Date,
  holdExpiresAt: Date,
  holdStatus: { type: String, enum: ['active', 'payment_submitted', 'converted', 'released'] },
  holdReleasedAt: Date,
  holdConvertedAt: Date,
  reservationActivatedAt: Date,
  holdReleaseReason: { type: String, enum: ['expired', 'client_cancelled', 'booking_cancelled', 'payment_rejected', 'converted_to_reservation'] },
  cancellationReason: String,
  releasedAt: Date,
  releasedBy: reference('User', false),
  releasedByRole: { type: String, enum: ['staff', 'admin'] },
  status: {
    type: String, required: true, default: 'pending',
    enum: ['awaiting_downpayment', 'pending', 'confirmed', 'checked_in', 'mechanic_assigned', 'in_service',
      'final_inspection', 'ready_for_release', 'completed', 'cancelled', 'rejected', 'no_show'],
  },
}, { timestamps: true });

bookingSchema.index({ bookingDate: 1, bookingTime: 1, status: 1 });
bookingSchema.index({ bookingDate: 1, status: 1, reservedStartAt: 1, reservedEndAt: 1 });
bookingSchema.index({ client: 1, createdAt: -1 });
bookingSchema.index({ client: 1, status: 1, releasedAt: -1 });
bookingSchema.index({ vehicle: 1, status: 1, releasedAt: -1 });
bookingSchema.index({ status: 1, releasedAt: 1 });
bookingSchema.index({ schedule: 1, status: 1, holdStatus: 1, holdExpiresAt: 1 });
bookingSchema.index({ bookingDate: 1, status: 1, holdStatus: 1, holdExpiresAt: 1 });

bookingSchema.pre('validate', function () {
  const hasStart = this.reservedStartAt != null;
  const hasEnd = this.reservedEndAt != null;
  if (hasStart !== hasEnd) this.invalidate('reservedEndAt', 'Reservation needs both start and end times.');
  else if (hasStart && this.reservedEndAt <= this.reservedStartAt) this.invalidate('reservedEndAt', 'Reservation end must follow its start.');
});

module.exports = mongoose.model('Booking', bookingSchema);
