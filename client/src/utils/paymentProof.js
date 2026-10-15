export const MAX_PROOF_BYTES = 8 * 1024 * 1024
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const digitalMethods = new Set(['gcash', 'maya', 'bank_transfer'])

export function needsPaymentProof(method) { return digitalMethods.has(method) }

export function proofError(file) {
  if (!file) return 'Choose a payment proof image.'
  if (!allowedTypes.has(file.type)) return 'Choose a JPG, PNG, or WebP image.'
  if (!file.size || file.size > MAX_PROOF_BYTES) return 'Image must be 8 MB or smaller.'
  return ''
}

export function paymentForm({ stage, amount, method, reference, proof }) {
  const form = new FormData()
  form.append('stage', stage)
  form.append('amount', String(amount))
  form.append('method', method)
  form.append('reference', reference)
  if (needsPaymentProof(method) && proof) form.append('proof', proof)
  return form
}
