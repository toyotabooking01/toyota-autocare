const mongoose = require('mongoose');
const { archive } = require('./fields');

const serviceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 3000, default: '' },
  estimatedDuration: { type: Number, required: true, min: 1, validate: Number.isInteger }, // minutes
  estimatedPrice: { type: Number, required: true, min: 0 }, // PHP
  maintenanceReminderInterval: {
    type: Number, min: 1, validate: value => value == null || Number.isInteger(value), default: null,
  }, // days; null disables automatic reminders
  isActive: { type: Boolean, default: true },
  ...archive,
}, { timestamps: true });

module.exports = mongoose.model('Service', serviceSchema);
