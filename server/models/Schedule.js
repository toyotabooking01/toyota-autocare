const mongoose = require('mongoose');
const { calendarDate, timeSlot, nonNegativeInteger } = require('./fields');

const scheduleSchema = new mongoose.Schema({
  date: { ...calendarDate },
  timeSlot: { ...timeSlot },
  maximumCapacity: { type: Number, required: true, min: 1, validate: Number.isInteger },
  currentBookingCount: {
    ...nonNegativeInteger,
    validate: {
      validator(value) { return Number.isInteger(value) && value <= this.maximumCapacity; },
      message: 'Booking count must be an integer within capacity.',
    },
  },
  isEnabled: { type: Boolean, default: true },
}, { timestamps: true });

scheduleSchema.index({ date: 1, timeSlot: 1 }, { unique: true });

module.exports = mongoose.model('Schedule', scheduleSchema);
