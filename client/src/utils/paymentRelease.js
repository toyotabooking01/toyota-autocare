export function releaseBlockReason(summary) {
  if (!summary) return 'Loading authoritative payment summary.'
  if (summary.paymentStatus === 'pending_verification') return 'Final payment is still awaiting verification.'
  if (summary.paymentStatus === 'rejected') return 'Final payment was rejected. Submit a new final payment.'
  if (!summary.payments?.some(payment => payment.stage === 'final')) return 'Final payment has not yet been submitted.'
  if (summary.remainingBalanceCents > 0 || summary.paymentStatus !== 'paid') return 'Full payment is required before the vehicle can be released.'
  return ''
}
