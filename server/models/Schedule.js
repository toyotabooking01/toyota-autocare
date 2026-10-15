const mongoose = require('mongoose');
const { calendarDate, timeSlot, nonNegativeInteger } = require('./fields');

const scheduleSchema = new mongoose.Schema({
  date: { ...calendarDate },
  timeSlot: { ...timeSlot },
  openingTime: { ...timeSlot, required: false },
  closingTime: { ...timeSlot, required: false },
  maximumCapacity: { type: Number, required: true, min: 1, validate: Number.isInteger },
  currentBookingCount: {
    ...nonNegativeInteger,
    validate: {
      validator(value) { return Number.isInteger(value) && value <= this.maximumCapacity; },
      message: 'Booking count must be an integer within capacity.',
    },
  },
  temporaryHoldCount: { ...nonNegativeInteger, default: 0 },
  isEnabled: { type: Boolean, default: true },
}, { timestamps: true });

scheduleSchema.pre('validate', function () {
  if (this.currentBookingCount + this.temporaryHoldCount > this.maximumCapacity) {
    this.invalidate('temporaryHoldCount', 'Bookings and holds must fit within capacity.');
  }
  const hasOpening = this.openingTime != null;
  const hasClosing = this.closingTime != null;
  if (hasOpening !== hasClosing) this.invalidate('closingTime', 'Working hours need both opening and closing times.');
  else if (hasOpening && this.closingTime <= this.openingTime) this.invalidate('closingTime', 'Closing time must follow opening time.');
  else if (hasOpening && (this.timeSlot < this.openingTime || this.timeSlot >= this.closingTime)) {
    this.invalidate('timeSlot', 'Appointment time must fall within working hours.');
  }
});

scheduleSchema.index({ date: 1, timeSlot: 1 }, { unique: true });

module.exports = mongoose.model('Schedule', scheduleSchema);
