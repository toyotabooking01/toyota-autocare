import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notificationDestination, notificationTime } from '../src/utils/notificationDisplay.js'

test('notification types lead only to relevant pages available to each role', () => {
  for (const role of ['client', 'staff', 'admin']) assert.equal(notificationDestination({ type: 'booking' }, role), `/${role}/bookings`)
  assert.equal(notificationDestination({ type: 'job_order' }, 'client'), '/client/bookings')
  assert.equal(notificationDestination({ type: 'job_order' }, 'mechanic'), '/mechanic/jobs')
  assert.equal(notificationDestination({ type: 'job_order' }, 'staff'), '/staff/job-orders')
  assert.equal(notificationDestination({ type: 'job_order' }, 'admin'), '/admin/job-orders')
  assert.equal(notificationDestination({ type: 'maintenance_reminder' }, 'client'), '/client/reminders')
  assert.equal(notificationDestination({ type: 'maintenance_reminder' }, 'mechanic'), '')
  assert.equal(notificationDestination({ type: 'maintenance_reminder' }, 'staff'), '')
  assert.equal(notificationDestination({ type: 'system' }, 'admin'), '')
  assert.equal(notificationDestination({ type: 'unknown' }, 'client'), '')
})

test('relative timestamps tolerate missing, malformed, and future dates', () => {
  const now = Date.parse('2026-10-14T10:00:00Z')
  assert.equal(notificationTime(null, now), '')
  assert.equal(notificationTime('invalid', now), '')
  assert.equal(notificationTime('2026-10-14T10:01:00Z', now), 'Just now')
  assert.equal(notificationTime('2026-10-14T09:55:00Z', now), '5 minutes ago')
  assert.equal(notificationTime('2026-10-14T09:00:00Z', now), '1 hour ago')
  assert.equal(notificationTime('2026-10-13T10:00:00Z', now), 'yesterday')
})
