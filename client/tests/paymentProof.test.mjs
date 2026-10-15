import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_PROOF_BYTES, needsPaymentProof, paymentForm, proofError } from '../src/utils/paymentProof.js'

test('digital methods require an image; cash and no-charge do not', () => {
  for (const method of ['gcash', 'maya', 'bank_transfer']) assert.equal(needsPaymentProof(method), true)
  for (const method of ['cash', 'no_charge']) assert.equal(needsPaymentProof(method), false)
  assert.equal(proofError(null), 'Choose a payment proof image.')
})

test('payment proof accepts JPEG, PNG and WebP up to 8 MB', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
    assert.equal(proofError(new File(['image'], 'proof', { type })), '')
  }
  assert.match(proofError(new File(['bad'], 'proof.gif', { type: 'image/gif' })), /JPG, PNG, or WebP/)
  assert.equal(MAX_PROOF_BYTES, 8 * 1024 * 1024)
  assert.match(proofError(new File([new Uint8Array(MAX_PROOF_BYTES + 1)], 'large.png', { type: 'image/png' })), /8 MB/)
})

test('multipart form includes the selected proof only for digital methods', () => {
  const proof = new File(['image'], 'proof.png', { type: 'image/png' })
  const digital = paymentForm({ stage: 'final', amount: 100.5, method: 'gcash', reference: 'ABC', proof })
  assert.equal(digital.get('stage'), 'final')
  assert.equal(digital.get('amount'), '100.5')
  assert.equal(digital.get('method'), 'gcash')
  assert.equal(digital.get('reference'), 'ABC')
  assert.equal(digital.get('proof')?.name, 'proof.png')
  const cash = paymentForm({ stage: 'downpayment', amount: 100, method: 'cash', reference: '', proof })
  assert.equal(cash.has('proof'), false)
  assert.equal(cash.has('proofImage'), false)
})
