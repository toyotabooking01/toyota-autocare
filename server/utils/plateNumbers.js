const { canonicalPlateNumber } = require('../../shared/accountValidation.mjs');
const HttpError = require('./HttpError');

const duplicateMessage = 'This plate number is already registered.';

function duplicatePlateFilter(plateNumber, excludeId, options = {}) {
  const canonical = canonicalPlateNumber(plateNumber, options);
  if (!canonical) throw new HttpError(400, 'Enter a valid Philippine plate number.', {
    plateNumber: 'Enter a valid Philippine plate number.',
  });
  const [prefix, suffix] = canonical.split(' ');
  return { plateNumber: { $regex: `^${prefix}[\\s-]*${suffix}$`, $options: 'i' },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}) };
}

function duplicatePlateError() {
  return new HttpError(409, duplicateMessage, { plateNumber: duplicateMessage });
}

module.exports = { duplicatePlateFilter, duplicatePlateError, duplicateMessage };
