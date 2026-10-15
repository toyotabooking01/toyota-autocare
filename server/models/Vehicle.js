const mongoose = require('mongoose');
const { archive, reference, nonNegativeInteger } = require('./fields');
const { canonicalPlateNumber } = require('../../shared/accountValidation.mjs');

const vehicleSchema = new mongoose.Schema({
  owner: reference('User'),
  make: { type: String, required: true, trim: true, maxlength: 80 },
  model: { type: String, required: true, trim: true, maxlength: 80 },
  // Optional for historical vehicles created before the Toyota catalog was introduced.
  variant: { type: String, trim: true, maxlength: 120 },
  catalogEntry: { type: mongoose.Schema.Types.ObjectId, ref: 'ToyotaCatalog' },
  year: { type: Number, required: true, min: 1886,
    validate: value => Number.isInteger(value) && value <= new Date().getUTCFullYear() + 1 },
  plateNumber: {
    type: String, required: true, unique: true,
    set: value => typeof value === 'string' ? canonicalPlateNumber(value) || value : value,
    validate: {
      validator: function(value) {
        return Boolean(canonicalPlateNumber(value, { existingPlate: this.$locals?.existingPlate
          || (!this.isNew && !this.isModified('plateNumber') ? value : undefined) }));
      },
      message: 'Enter a valid Philippine plate number.',
    },
  },
  transmission: { type: String, required: true, enum: ['manual', 'automatic', 'cvt'] },
  currentMileage: { ...nonNegativeInteger },
  // Transactional guard serializes active-service duplicate checks per Vehicle.
  bookingLockVersion: { type: Number, min: 0, default: 0, select: false },
  ...archive,
}, { timestamps: true });

vehicleSchema.index({ owner: 1, isArchived: 1 });

module.exports = mongoose.model('Vehicle', vehicleSchema);
