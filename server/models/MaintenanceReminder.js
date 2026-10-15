const mongoose = require('mongoose');
const { reference } = require('./fields');

const maintenanceReminderSchema = new mongoose.Schema({
  client: reference('User'),
  vehicle: reference('Vehicle'),
  service: reference('Service'),
  sourceBooking: reference('Booking', false),
  lastServiceDate: { type: Date, required: true },
  lastServiceMileage: { type: Number, min: 0 },
  nextRecommendedMileage: { type: Number, min: 0 },
  nextRecommendedServiceDate: {
    type: Date,
    validate: {
      validator(value) { return !value || !this.lastServiceDate || value > this.lastServiceDate; },
      message: 'Next service must be after the last service.',
    },
  },
  status: { type: String, enum: ['pending', 'sent', 'dismissed', 'completed'], default: 'pending' },
  notifiedAt: Date,
  previousRecommendations: [{ sourceBooking: reference('Booking', false), lastServiceDate: Date,
    nextRecommendedServiceDate: Date, lastServiceMileage: Number, nextRecommendedMileage: Number,
    status: { type: String, enum: ['superseded'] }, supersededAt: Date }],
}, { timestamps: true });

maintenanceReminderSchema.index({ client: 1, vehicle: 1, service: 1 }, { unique: true });

module.exports = mongoose.model('MaintenanceReminder', maintenanceReminderSchema);
