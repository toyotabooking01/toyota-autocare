const Service = require('../models/Service');

// Backfill only legacy records that do not yet have a persisted classification.
async function backfillLegacyServiceTypes() {
  const missingType = { $or: [{ type: { $exists: false } }, { type: null }] };
  const diagnostic = await Service.updateMany({ ...missingType, isOtherService: true }, { $set: { type: 'Diagnostic' } });
  const maintenance = await Service.updateMany({ ...missingType, isOtherService: { $ne: true } }, { $set: { type: 'Maintenance' } });
  return { diagnostic: diagnostic.modifiedCount || 0, maintenance: maintenance.modifiedCount || 0 };
}

module.exports = { backfillLegacyServiceTypes };
