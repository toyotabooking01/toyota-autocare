function emailDeliveryEnabled() {
  return process.env.EMAIL_DELIVERY_ENABLED !== 'false';
}

module.exports = { emailDeliveryEnabled };
