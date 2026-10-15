const labels = Object.freeze({
  gcash: 'GCash', maya: 'Maya', bank_transfer: 'Bank Transfer', cash: 'Cash', no_charge: 'No Charge',
})

export function formatPaymentMethod(method) {
  return labels[method] || String(method || 'Not recorded').replaceAll('_', ' ')
}
