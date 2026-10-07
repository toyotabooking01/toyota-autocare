const mongoose = require('mongoose');
const { reference } = require('./fields');

const maintenanceReminderSchema = new mongoose.Schema({
  client: reference('User'),
  vehicle: reference('Vehicle'),
  service: reference('Service'),
  lastServiceDate: { type: Date, required: true },
  nextRecommendedServiceDate: {
    type: Date, required: true,
    validate: {
      validator(value) { return !this.lastServiceDate || value > this.lastServiceDate; },
      message: 'Next service must be after the last service.',
    },
  },
  status: { type: String, enum: ['pending', 'sent', 'dismissed', 'completed'], default: 'pending' },
}, { timestamps: true });

maintenanceReminderSchema.index({ client: 1, vehicle: 1, service: 1 }, { unique: true });

module.exports = mongoose.model('MaintenanceReminder', maintenanceReminderSchema);
