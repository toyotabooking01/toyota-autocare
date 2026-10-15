const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  make: { type: String, enum: ['Toyota'], default: 'Toyota', required: true },
  market: { type: String, enum: ['Philippines'], default: 'Philippines', required: true },
  model: { type: String, required: true, trim: true, maxlength: 80 },
  year: { type: Number, required: true, min: 1950 },
  variant: { type: String, default: null, trim: true, maxlength: 120 },
  category: { type: String, required: true, trim: true },
  fuelType: { type: String, enum: ['gasoline', 'diesel', 'hybrid', 'electric'] },
  transmission: { type: String, enum: ['manual', 'automatic', 'cvt'] },
  seatingCapacity: { type: Number, min: 1, max: 30 },
  imageUrl: { type: String, default: '', trim: true },
  generationImageUrl: { type: String, default: '', trim: true },
  modelImageUrl: { type: String, default: '', trim: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

schema.index({ make: 1, market: 1, model: 1, year: 1, variant: 1 }, { unique: true });

module.exports = mongoose.model('ToyotaCatalog', schema);
