import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bookingActionKinds, canReviewPayment } from '../src/utils/bookingActions.js'

test('only Staff and Admin can review submitted payment proofs', () => {
  const submitted = { status: 'submitted' }
  assert.equal(canReviewPayment(submitted, 'staff'), true)
  assert.equal(canReviewPayment(submitted, 'admin'), true)
  assert.equal(canReviewPayment(submitted, 'client'), false)
  assert.equal(canReviewPayment(submitted, 'mechanic'), false)
  assert.equal(canReviewPayment({ status: 'rejected' }, 'staff'), false)
});

test('provisional booking cannot be confirmed; converted pending booking exposes separate Confirm action', () => {
  const provisional = { status: 'awaiting_downpayment', holdStatus: 'payment_submitted' }
  assert.deepEqual(bookingActionKinds(provisional, 'staff'), [])
  assert.deepEqual(bookingActionKinds(provisional, 'admin'), [])
  assert.deepEqual(bookingActionKinds(provisional, 'client'), [])
  const pending = { ...provisional, status: 'pending', holdStatus: 'converted' }
  assert.deepEqual(bookingActionKinds(pending, 'staff'), ['confirm', 'reject', 'cancel'])
  assert.deepEqual(bookingActionKinds(pending, 'admin'), ['confirm', 'reject', 'cancel'])
  assert.deepEqual(bookingActionKinds(pending, 'client'), ['cancel'])
});
