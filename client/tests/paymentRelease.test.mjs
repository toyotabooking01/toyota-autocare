import { test } from 'node:test'
import assert from 'node:assert/strict'
import { releaseBlockReason } from '../src/utils/paymentRelease.js'

test('release button stays disabled until verified final payment clears the balance', () => {
  assert.match(releaseBlockReason(null), /Loading/)
  assert.match(releaseBlockReason({ paymentStatus: 'final_payment_due', payments: [] }), /not yet been submitted/)
  assert.match(releaseBlockReason({ paymentStatus: 'pending_verification', payments: [{ stage: 'final' }] }), /awaiting verification/)
  assert.match(releaseBlockReason({ paymentStatus: 'paid', remainingBalanceCents: 100, payments: [{ stage: 'final' }] }), /Full payment/)
  assert.equal(releaseBlockReason({ paymentStatus: 'paid', remainingBalanceCents: 0, payments: [{ stage: 'final' }] }), '')
})
