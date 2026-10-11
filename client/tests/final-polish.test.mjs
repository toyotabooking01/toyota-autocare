import { test } from 'node:test'
import assert from 'node:assert/strict'
import { friendlyError, friendlyFieldErrors, friendlyText } from '../src/utils/friendlyErrors.js'
import { roleNavigation } from '../src/app/navigation.js'
import { visibleRemoteErrors } from '../src/utils/formValidation.js'

test('technical API messages never reach alerts or field helper text', () => {
  for (const message of ['MongoServerError E11000 duplicate key', 'CastError: ObjectId failed', 'SMTP authentication failed',
    'Password exceeds 72 UTF-8 bytes', '<html>Server failure</html>', { message: 'private' }, 'a'.repeat(301), '']) {
    assert.equal(friendlyText(message), 'We could not complete that request. Please try again.')
    assert.deepEqual(friendlyFieldErrors({ name: message, privateField: 'secret' }, ['name']), { name: 'Please check this field.' })
  }
  assert.equal(friendlyError({ response: { status: 500, data: { message: 'Private database details' } } }), 'We could not complete that request. Please try again.')
})
test('useful validation stays visible and corrections clear only the related errors', () => {
  for (const message of ['Service Bay already exists.', 'Invalid email or password.', 'Plate number already exists.', 'Choose another available schedule.']) {
    assert.equal(friendlyError({ response: { status: 400, data: { message } } }), message)
  }
  assert.match(friendlyError({}), /connection/)
  assert.match(friendlyError({ response: { status: 429 } }), /wait/)
  const errors = friendlyFieldErrors({ name: 'Service Bay already exists.', operationalStatus: 'Select a valid status.' }, ['name', 'operationalStatus'])
  assert.deepEqual(visibleRemoteErrors('bay', { name: 'BAY 2', operationalStatus: '' }, errors,
    { name: 'BAY 1', operationalStatus: '' }), { operationalStatus: 'Select a valid status.' })
})
test('menus contain only implemented role pages with no duplicate paths', () => {
  const implemented = {
    client: ['dashboard', 'vehicles', 'book-service', 'bookings', 'notifications', 'reminders'],
    mechanic: ['dashboard', 'jobs', 'active-job'],
    admin: ['dashboard', 'bookings', 'walk-in', 'mechanics', 'services', 'schedules', 'service-bays', 'job-orders', 'reminders', 'reports'],
  }
  for (const [role, menu] of Object.entries(roleNavigation)) {
    const paths = menu.map(item => item.path)
    assert.deepEqual(paths, implemented[role])
    assert.equal(new Set(paths).size, paths.length)
  }
})
