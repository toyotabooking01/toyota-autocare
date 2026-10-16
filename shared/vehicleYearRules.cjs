// Generated from shared/vehicleYearRules.mjs; do not edit.
// Regenerate: node server/scripts/generate-validation-cjs.js
const VEHICLE_YEAR_FLOOR = 1990
const latestVehicleYear = (allowNextModelYear = false) => new Date().getUTCFullYear() + (allowNextModelYear ? 1 : 0)

module.exports = { VEHICLE_YEAR_FLOOR, latestVehicleYear };
