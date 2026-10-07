const mongoose = require('mongoose');
const { archive, reference, nonNegativeInteger } = require('./fields');

const vehicleSchema = new mongoose.Schema({
  owner: reference('User'),
  make: { type: String, required: true, trim: true, maxlength: 80 },
  model: { type: String, required: true, trim: true, maxlength: 80 },
  year: { type: Number, required: true, min: 1886,
    validate: value => Number.isInteger(value) && value <= new Date().getUTCFullYear() + 1 },
  plateNumber: {
    type: String, required: true, unique: true,
    set: value => typeof value === 'string' ? value.toUpperCase().replace(/[\s-]/g, '') : value,
    match: /^[A-Z0-9]{4,10}$/,
  },
  transmission: { type: String, required: true, enum: ['manual', 'automatic', 'cvt'] },
  currentMileage: { ...nonNegativeInteger },
  ...archive,
}, { timestamps: true });

module.exports = mongoose.model('Vehicle', vehicleSchema);
