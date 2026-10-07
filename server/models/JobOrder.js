const mongoose = require('mongoose');
const { reference } = require('./fields');

const checklistItemSchema = new mongoose.Schema({
  description: { type: String, required: true, trim: true, maxlength: 500 },
  isCompleted: { type: Boolean, default: false },
}, { _id: false });

const jobOrderSchema = new mongoose.Schema({
  booking: { ...reference('Booking'), unique: true },
  mechanic: reference('User'),
  serviceBay: reference('ServiceBay'),
  customerConcern: { type: String, trim: true, maxlength: 3000, default: '' },
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

module.exports = mongoose.model('JobOrder', jobOrderSchema);
