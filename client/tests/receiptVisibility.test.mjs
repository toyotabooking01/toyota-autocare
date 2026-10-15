import { test } from 'node:test'
import assert from 'node:assert/strict'
import { receiptForPayment } from '../src/utils/receiptVisibility.js'

test('verified payments expose only their matching receipt type and payment', () => {
  const receipts = [{ id: 'receipt-1', paymentId: 'payment-1', type: 'downpayment' },
    { id: 'receipt-2', paymentId: 'payment-2', type: 'final_payment' },
    { id: 'receipt-3', paymentId: 'payment-2', type: 'full_payment' }]
  assert.equal(receiptForPayment({ id: 'payment-1', stage: 'downpayment', status: 'verified' }, receipts)?.id, 'receipt-1')
  for (const status of ['submitted', 'rejected'])
    assert.equal(receiptForPayment({ id: 'payment-1', stage: 'downpayment', status }, receipts), null)
  assert.equal(receiptForPayment({ id: 'payment-2', stage: 'final', status: 'verified' }, receipts)?.id, 'receipt-2')
  assert.equal(receiptForPayment({ id: 'payment-1', stage: 'final', status: 'verified' }, receipts), null)
  assert.equal(receiptForPayment({ id: 'other-payment', stage: 'downpayment', status: 'verified' }, receipts), null)
  assert.equal(receiptForPayment({ id: 'payment-1', stage: 'downpayment', status: 'verified' }, []), null)
})
