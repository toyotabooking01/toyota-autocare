const mongoose = require('mongoose');
const { archive } = require('./fields');

const serviceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  // Sparse index protects new/renamed services without forcing legacy duplicates to migrate.
  nameKey: { type: String, select: false, unique: true, sparse: true },
  description: { type: String, trim: true, maxlength: 3000, default: '' },
  estimatedDuration: { type: Number, required: true, min: 1, validate: Number.isInteger }, // minutes
  estimatedPrice: { type: Number, required: true, min: 0 }, // PHP
  checklistTemplate: {
    type: [{ type: String, trim: true, minlength: 1, maxlength: 500 }], default: [],
    validate: [
      { validator: items => items.length <= 10, message: 'A Service checklist can contain at most 10 items.' },
      { validator: items => new Set(items.map(item => item.trim().toLocaleLowerCase())).size === items.length, message: 'Checklist items must be unique.' },
    ],
  },
  isOtherService: { type: Boolean, default: false },
  maintenanceReminderInterval: {
    type: Number, min: 1, validate: value => value == null || Number.isInteger(value), default: null,
  }, // days; null disables automatic reminders
  maintenanceIntervalKm: { type: Number, min: 1, max: 9999999,
    validate: value => value == null || Number.isSafeInteger(value), default: null },
  isActive: { type: Boolean, default: true },
  bookingLockVersion: { type: Number, min: 0, default: 0, select: false },
  ...archive,
}, { timestamps: true });

serviceSchema.pre('validate', function () {
  if (this.isNew || this.isModified('name')) this.nameKey = this.name?.trim().toLowerCase();
});

module.exports = mongoose.model('Service', serviceSchema);
