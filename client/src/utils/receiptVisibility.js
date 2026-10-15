export function receiptForPayment(payment, receipts) {
  if (!['downpayment', 'final'].includes(payment?.stage) || payment.status !== 'verified') return null
  const type = payment.stage === 'downpayment' ? 'downpayment' : 'final_payment'
  return receipts.find(receipt => receipt.paymentId === payment.id && receipt.type === type) || null
}
