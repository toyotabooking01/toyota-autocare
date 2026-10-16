// Generated from shared/serviceBayName.mjs; do not edit.
// Regenerate: node server/scripts/generate-validation-cjs.js
// Match the existing ServiceBay storage and unique-index representation.
const normalizeServiceBayName = value => value.trim().toUpperCase()
const SERVICE_BAY_DUPLICATE = 'Service Bay already exists.'

module.exports = { normalizeServiceBayName, SERVICE_BAY_DUPLICATE };
