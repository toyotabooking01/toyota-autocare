import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blocksFinalInspection, canRequestAdditionalWork, canReviewAdditionalWork,
  canDecideAdditionalWork, canPerformAdditionalWork } from '../src/utils/additionalWorkState.js'

test('additional work controls follow role and request state', () => {
  assert.equal(canRequestAdditionalWork('mechanic', 'in_service', 'job-id'), true)
  assert.equal(canRequestAdditionalWork('admin', 'in_service', 'job-id'), true)
  for (const role of ['staff', 'client']) assert.equal(canRequestAdditionalWork(role, 'in_service', 'job-id'), false)
  assert.equal(canRequestAdditionalWork('mechanic', 'final_inspection', 'job-id'), false)
  assert.equal(canReviewAdditionalWork('staff', { status: 'pending_staff_review' }), true)
  assert.equal(canReviewAdditionalWork('admin', { status: 'pending_staff_review' }), true)
  assert.equal(canReviewAdditionalWork('mechanic', { status: 'pending_staff_review' }), false)
  assert.equal(canReviewAdditionalWork('staff', { status: 'pending_client_approval' }), false)
  assert.equal(canDecideAdditionalWork('client', { status: 'pending_client_approval' }), true)
  assert.equal(canDecideAdditionalWork('staff', { status: 'pending_client_approval' }), false)
  assert.equal(canDecideAdditionalWork('client', { status: 'approved' }), false)
  assert.equal(canPerformAdditionalWork('mechanic', { status: 'approved' }), true)
  assert.equal(canPerformAdditionalWork('admin', { status: 'approved' }), true)
  assert.equal(canPerformAdditionalWork('staff', { status: 'approved' }), false)
  assert.equal(canPerformAdditionalWork('mechanic', { status: 'declined' }), false)
})

test('only unresolved requests block final inspection', () => {
  for (const status of ['pending_staff_review', 'pending_client_approval', 'approved'])
    assert.equal(blocksFinalInspection([{ status }]), true)
  for (const status of ['declined', 'performed', 'staff_rejected', 'cancelled'])
    assert.equal(blocksFinalInspection([{ status }]), false)
  assert.equal(blocksFinalInspection([]), false)
})
