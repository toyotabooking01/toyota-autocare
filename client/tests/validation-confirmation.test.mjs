import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateClientForm, visibleRemoteErrors } from '../src/utils/formValidation.js'
import { createConfirmationController } from '../src/components/confirmationState.js'

const profile = { termsAccepted: true, fullName: 'Juan Santos', email: 'juan@example.com', phone: '09171234567', password: 'A secure passphrase 42!', confirmPassword: 'A secure passphrase 42!' }
test('auth validation rejects whitespace, malformed contacts, weak and mismatched passwords', () => {
  assert.deepEqual(validateClientForm('register', profile), {})
  for (const [field, value] of [['fullName', '  '], ['fullName', '123'], ['email', 'x@-example.com'], ['phone', '12345678901'], ['password', ' '.repeat(12)], ['password', '😀'.repeat(19)], ['confirmPassword', 'different']]) {
    assert.ok(validateClientForm('register', { ...profile, [field]: value })[field], field)
  }
  assert.deepEqual(validateClientForm('login', { email: profile.email, password: 'old' }), {})
  assert.ok(validateClientForm('otp', { email: profile.email, otp: '12345' }).otp)
})
test('numeric values reject coercible non-decimal strings, negatives, fractions and oversized values', () => {
  for (const value of ['0x10', 'abc', '-1', '1.2', '99999999']) assert.ok(validateClientForm('vehicle', { currentMileage: value }, { partial: true }).currentMileage)
  assert.deepEqual(validateClientForm('vehicle', { currentMileage: '123' }, { partial: true }), {})
  assert.equal(validateClientForm('mechanic', { phone: '' }, { partial: true }).phone, 'Philippine mobile number is required.')
  assert.ok(validateClientForm('service', { estimatedPrice: ' ' }, { partial: true }).estimatedPrice)
})
test('schedule rules reject calendar errors, reserved date/time changes and capacity reductions', () => {
  const original = { date: '2099-12-12', timeSlot: '10:00', maximumCapacity: 5, currentBookingCount: 3 }
  assert.deepEqual(validateClientForm('schedule', original, { schedule: original }), {})
  assert.ok(validateClientForm('schedule', { ...original, date: '2099-02-30' }).date)
  assert.ok(validateClientForm('schedule', { ...original, date: '2000-01-01' }).timeSlot)
  const errors = validateClientForm('schedule', { ...original, date: '2099-12-13', timeSlot: '11:00', maximumCapacity: '2' }, { schedule: original })
  assert.ok(errors.date && errors.timeSlot && errors.maximumCapacity)
  const independent = validateClientForm('schedule', { ...original, date: '', maximumCapacity: '2' }, { schedule: original })
  assert.equal(independent.date, 'Date is required.')
  assert.equal(independent.maximumCapacity, 'Capacity cannot be lower than the current booked count.')
  assert.ok(validateClientForm('report', { from: '2026-10-10', to: '2026-10-09' }).to)
})
test('booking and assignment selections must still belong to loaded available options', () => {
  const id = '123456789012345678901234'
  const values = { vehicle: id, services: [id], schedule: id, client: id }
  const available = { vehicle: [{ _id: id }], services: [{ _id: id }], client: [{ _id: id }], schedule: [{ _id: id, date: '2099-01-01', timeSlot: '10:00', maximumCapacity: 3, currentBookingCount: 0 }] }
  assert.deepEqual(validateClientForm('booking', values, { available }), {})
  const errors = validateClientForm('booking', values, { available: { ...available, vehicle: [], services: [], client: [], schedule: [] } })
  assert.ok(errors.vehicle && errors.services && errors.client && errors.schedule)
  assert.ok(validateClientForm('assignment', { mechanic: id, serviceBay: id }, { available: { mechanic: [], serviceBay: [] } }).mechanic)
})
test('booking availability validation tolerates unloaded or omitted lists and reports unavailable selections clearly', () => {
  const id = '123456789012345678901234'
  const newWalkIn = validateClientForm('booking', { services: [], schedule: '' }, {
    skip: ['vehicle'], available: { services: [], schedule: [] },
  })
  assert.equal(newWalkIn.vehicle, undefined)
  assert.equal(validateClientForm('booking', { vehicle: id, services: [id], schedule: id }, {
    available: { services: undefined, schedule: undefined },
  }).vehicle, 'Could not verify this selection. Please try again.')
  const empty = validateClientForm('booking', { vehicle: id, services: [id], schedule: id }, {
    available: { vehicle: [], services: [], schedule: [] },
  })
  assert.equal(empty.vehicle, 'Select an available vehicle.')
  assert.equal(empty.services, 'One or more selected services are unavailable. Update your selection.')
  assert.equal(empty.schedule, 'Choose an available future schedule with remaining capacity.')
  assert.doesNotThrow(() => validateClientForm('booking', { services: [], schedule: '' }, { available: null }))
})
test('related field corrections clear stale server errors without discarding other field errors', () => {
  const snapshot = { newPassword: 'original', confirmPassword: 'corrected', email: 'duplicate@example.com' }
  const remote = { confirmPassword: 'Does not match', email: 'Already exists' }
  assert.deepEqual(visibleRemoteErrors('reset', { ...snapshot, newPassword: 'corrected' }, remote, snapshot), { email: 'Already exists' })
  assert.deepEqual(visibleRemoteErrors('report', { from: '2026-10-01', to: '2026-10-10' }, { to: 'End date must follow start date.' }, { from: '2026-10-11', to: '2026-10-10' }), {})
})

test('catalog and work forms enforce required selections, text limits, and numeric limits', () => {
  assert.ok(validateClientForm('bay', { name: ' ', operationalStatus: 'unknown' }).name)
  assert.ok(validateClientForm('bay', { name: 'Bay 1', operationalStatus: '' }).operationalStatus)
  const service = validateClientForm('service', { name: 'x'.repeat(121), description: 'x'.repeat(3001), estimatedDuration: '1.5', estimatedPrice: '-1', maintenanceReminderInterval: '0' })
  for (const field of ['name', 'description', 'estimatedDuration', 'estimatedPrice', 'maintenanceReminderInterval']) assert.ok(service[field], field)
  assert.ok(validateClientForm('work', { mechanicNotes: 'x'.repeat(5001), serviceChecklist: [{ description: ' ', isCompleted: false }] }).serviceChecklist)
  assert.ok(validateClientForm('vehicle', { transmission: 'unknown' }, { partial: true }).transmission)
  assert.equal(validateClientForm('mechanic', { employeeId: 'bad id' }, { partial: true }).employeeId, undefined)
  assert.ok(validateClientForm('mechanic', { phone: '09171234567', status: '', availability: 'unknown' }, { partial: true }).availability)
})
test('invalid forms never open confirmation; No preserves the draft and makes no request', () => {
  let state = null, calls = 0
  const controller = createConfirmationController(next => { state = next })
  const draft = { ...profile, fullName: ' ' }
  function submit() {
    if (Object.keys(validateClientForm('register', draft)).length) return
    controller.request('Create account?', () => { calls++ })
  }
  submit(); assert.equal(state, null)
  draft.fullName = profile.fullName
  submit(); assert.ok(state)
  controller.cancel()
  assert.equal(state, null); assert.equal(calls, 0); assert.deepEqual(draft, profile)
})
test('Yes executes once, rejects repeated submits, and blocks cancellation while processing', async () => {
  let state = null, calls = 0, finish
  const controller = createConfirmationController(next => { state = next })
  controller.request('Save?', async () => { calls++; await new Promise(resolve => { finish = resolve }) })
  assert.equal(controller.request('Duplicate?', () => { calls++ }), false)
  const first = controller.approve()
  await controller.approve(); controller.cancel()
  assert.equal(calls, 1); assert.equal(state.busy, true)
  finish(); await first
  assert.equal(state, null)
})
test('navigating away cancels a pending action and failed actions can be retried', async () => {
  let state = null, calls = 0
  const controller = createConfirmationController(next => { state = next })
  controller.request('Save?', () => { calls++ })
  controller.cancel(); await controller.approve(); assert.equal(calls, 0)
  controller.request('Save?', () => { if (++calls === 1) throw new Error('Failed') })
  await controller.approve(); assert.ok(state.error); assert.equal(state.busy, false)
  await controller.approve(); assert.equal(state, null); assert.equal(calls, 2)
})
