const mongoose = require('mongoose');
const { reference } = require('./fields');

const notificationSchema = new mongoose.Schema({
  user: reference('User'),
  title: { type: String, required: true, trim: true, maxlength: 160 },
  message: { type: String, required: true, trim: true, maxlength: 3000 },
  type: { type: String, enum: ['booking', 'job_order', 'payment', 'maintenance_reminder', 'system'], required: true },
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
  jobOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobOrder' },
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
  serviceBayId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceBay' },
  maintenanceReminderId: { type: mongoose.Schema.Types.ObjectId, ref: 'MaintenanceReminder' },
  relatedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  path: { type: String, maxlength: 120 },
  eventKey: { type: String, maxlength: 200, select: false },
  isRead: { type: Boolean, default: false },
}, { timestamps: true });

notificationSchema.index({ eventKey: 1 }, { unique: true, partialFilterExpression: { eventKey: { $type: 'string' } } });

module.exports = mongoose.model('Notification', notificationSchema);
