const mongoose = require('mongoose');
const Service = require('../models/Service');

function configuredDiagnosticMinutes() {
  const value = process.env.OTHER_SERVICE_ESTIMATED_DURATION_MINUTES === undefined
    ? 60 : Number(process.env.OTHER_SERVICE_ESTIMATED_DURATION_MINUTES);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('OTHER_SERVICE_ESTIMATED_DURATION_MINUTES must be a positive whole number.');
  return value;
}

async function ensureOtherService() {
  if (mongoose.connection.readyState !== 1) return null;
  let item = await Service.findOne({ $or: [{ isOtherService: true }, { name: /^other$/i }] });
  if (item) {
    let changed = false;
    if (!item.isOtherService) { item.isOtherService = true; changed = true; }
    if (!item.isActive) { item.isActive = true; changed = true; }
    if (item.isArchived) { item.isArchived = false; item.archivedAt = null; changed = true; }
    if (changed) await item.save();
    return item;
  }
  try {
    return await Service.create({ name: 'Other', description: 'Diagnostic assessment for a customer-described issue.',
      estimatedDuration: configuredDiagnosticMinutes(), estimatedPrice: 0, isOtherService: true, isActive: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
    item = await Service.findOne({ $or: [{ isOtherService: true }, { name: /^other$/i }] });
    if (!item) throw error;
    if (!item.isOtherService) { item.isOtherService = true; await item.save(); }
    return item;
  }
}

module.exports = { ensureOtherService, configuredDiagnosticMinutes };
