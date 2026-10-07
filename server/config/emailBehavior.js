// Explicit opt-in only. Missing NODE_ENV, staging and production never bypass verification.
function autoVerifyNewClient() {
  return process.env.NODE_ENV === 'development' && process.env.DEV_AUTO_VERIFY_EMAIL === 'true';
}

function emailDeliveryEnabled() {
  return process.env.EMAIL_DELIVERY_ENABLED !== 'false';
}

module.exports = { autoVerifyNewClient, emailDeliveryEnabled };
