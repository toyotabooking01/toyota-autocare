const mongoose = require('mongoose');
const { reference } = require('./fields');

const notificationSchema = new mongoose.Schema({
  user: reference('User'),
  title: { type: String, required: true, trim: true, maxlength: 160 },
  message: { type: String, required: true, trim: true, maxlength: 3000 },
  type: { type: String, enum: ['booking', 'job_order', 'maintenance_reminder', 'system'], required: true },
  eventKey: { type: String, maxlength: 100, select: false },
  isRead: { type: Boolean, default: false },
}, { timestamps: true });

notificationSchema.index({ eventKey: 1 }, { unique: true, partialFilterExpression: { eventKey: { $type: 'string' } } });

module.exports = mongoose.model('Notification', notificationSchema);
