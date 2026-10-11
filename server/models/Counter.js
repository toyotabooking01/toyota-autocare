const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  sequence: { type: Number, required: true, min: 1 },
}, { versionKey: false });

module.exports = mongoose.models.Counter || mongoose.model('Counter', counterSchema, 'counters');
