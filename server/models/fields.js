const mongoose = require('mongoose');

// Shared field definitions keep normalization consistent across models.
const email = {
  type: String, required: true, trim: true, lowercase: true,
  maxlength: 254, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
};
const archive = {
  isArchived: { type: Boolean, default: false },
  archivedAt: { type: Date, default: null },
  archivedBy: reference('User', false),
  archivedByRole: { type: String, enum: ['admin', 'client'] },
  archiveReason: { type: String, trim: true, maxlength: 300, default: '' },
  restoredAt: { type: Date, default: null },
  restoredBy: reference('User', false),
  restoredByRole: { type: String, enum: ['admin', 'client'] },
  archiveActivity: [{ action: { type: String, enum: ['archived', 'restored'], required: true },
    actor: reference('User'), actorRole: { type: String, enum: ['admin', 'client'], required: true },
    reason: { type: String, trim: true, maxlength: 300, default: '' },
    timestamp: { type: Date, required: true } }],
};
const timeSlot = { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ };
const calendarDate = {
  type: String, required: true,
  validate: {
    validator(value) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const date = new Date(value + 'T00:00:00.000Z');
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    },
    message: 'Use a valid YYYY-MM-DD calendar date.',
  },
};
function reference(model, required = true) {
  return { type: mongoose.Schema.Types.ObjectId, ref: model, required };
}
const nonNegativeInteger = {
  type: Number, min: 0, validate: Number.isInteger, default: 0,
};

module.exports = { email, archive, timeSlot, calendarDate, reference, nonNegativeInteger };
