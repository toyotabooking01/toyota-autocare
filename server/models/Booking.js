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
  concern: { type: String, trim: true, maxlength: 3000, default: '' },
  notes: { type: String, trim: true, maxlength: 5000, default: '' },
  estimatedCompletion: Date,
  status: {
    type: String, required: true, default: 'pending',
    enum: ['pending', 'confirmed', 'checked_in', 'mechanic_assigned', 'in_service',
      'final_inspection', 'ready_for_release', 'completed', 'cancelled', 'rejected', 'no_show'],
  },
}, { timestamps: true });

bookingSchema.index({ bookingDate: 1, bookingTime: 1, status: 1 });
bookingSchema.index({ client: 1, createdAt: -1 });

module.exports = mongoose.model('Booking', bookingSchema);
