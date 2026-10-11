const mongoose = require('mongoose');
const { archive } = require('./fields');
const { normalizeServiceBayName } = require('../../shared/serviceBayName.mjs');

const serviceBaySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, uppercase: true, set: value => typeof value === 'string' ? normalizeServiceBayName(value) : value, unique: true, maxlength: 80 },
  operationalStatus: { type: String, enum: ['operational', 'maintenance', 'out_of_service'], default: 'operational' },
  availability: { type: String, enum: ['available', 'occupied'], default: 'available' },
  ...archive,
}, { timestamps: true });

module.exports = mongoose.model('ServiceBay', serviceBaySchema);
