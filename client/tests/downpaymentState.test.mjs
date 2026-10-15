import { test } from 'node:test'
import assert from 'node:assert/strict'
import { downpaymentState } from '../src/utils/downpaymentState.js'

const now = Date.parse('2026-10-15T00:00:00Z')

test('verified downpayment presents pending booking and an officially reserved schedule', () => {
  const state = downpaymentState({ bookingStatus: 'pending', holdStatus: 'converted',
    payments: [{ stage: 'downpayment', status: 'verified' }] }, 'awaiting_downpayment', now)
  assert.equal(state.status, 'pending')
  assert.equal(state.paymentLabel, 'Downpayment Verified')
  assert.equal(state.reservationLabel, 'Reserved')
  assert.equal(state.provisional, false)
  assert.equal(state.holdActive, false)
});

test('rejected downpayment reopens the countdown and keeps the rejected attempt', () => {
  const payment = { stage: 'downpayment', status: 'rejected', id: 'old-proof' }
  const summary = { bookingStatus: 'awaiting_downpayment', holdStatus: 'active',
    holdExpiresAt: new Date(now + 15 * 60_000).toISOString(), payments: [payment] }
  const state = downpaymentState(summary, 'awaiting_downpayment', now)
  assert.equal(state.paymentLabel, 'Downpayment Rejected')
  assert.equal(state.secondsRemaining, 900)
  assert.equal(state.canRetry, true)
  assert.equal(state.latest, payment)
  const expired = downpaymentState(summary, 'awaiting_downpayment', now + 15 * 60_000)
  assert.equal(expired.secondsRemaining, 0)
  assert.equal(expired.canRetry, false)
  assert.equal(expired.retryExpired, true)
});

test('resubmitted proof becomes the current review attempt while rejected history remains', () => {
  const payments = [{ stage: 'downpayment', status: 'rejected', id: 'old' },
    { stage: 'downpayment', status: 'submitted', id: 'new' }]
  const state = downpaymentState({ bookingStatus: 'awaiting_downpayment', holdStatus: 'payment_submitted',
    holdExpiresAt: null, payments }, 'awaiting_downpayment', now)
  assert.equal(state.paymentLabel, 'Pending Verification')
  assert.equal(state.latest.id, 'new')
  assert.equal(payments[0].status, 'rejected')
  assert.equal(state.holdActive, false)
});

test('cancelled converted booking keeps verified payment history without claiming the slot is reserved', () => {
  const state = downpaymentState({ bookingStatus: 'cancelled', holdStatus: 'converted',
    payments: [{ stage: 'downpayment', status: 'verified' }] }, 'pending', now)
  assert.equal(state.paymentLabel, 'Downpayment Verified')
  assert.equal(state.reservationLabel, null)
});
