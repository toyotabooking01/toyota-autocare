import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notificationDestination } from '../src/utils/notificationDisplay.js'

const bookingId = '507f1f77bcf86cd799439011'
const jobOrderId = '507f1f77bcf86cd799439012'

test('notifications open the related record for the recipient role', () => {
  assert.equal(notificationDestination({ type: 'booking', bookingId }, 'client'), `/client/bookings?open=${bookingId}`)
  assert.equal(notificationDestination({ type: 'booking', bookingId }, 'staff'), `/staff/bookings?open=${bookingId}`)
  assert.equal(notificationDestination({ type: 'job_order', bookingId, jobOrderId }, 'mechanic'), `/mechanic/jobs?open=${jobOrderId}`)
  assert.equal(notificationDestination({ type: 'job_order', bookingId, jobOrderId }, 'client'), `/client/bookings?open=${bookingId}`)
  assert.equal(notificationDestination({ type: 'payment', bookingId }, 'client'), `/client/bookings?open=${bookingId}&section=payment`)
  assert.equal(notificationDestination({ type: 'job_order', bookingId, eventKey: `${bookingId}:ready_for_release` }, 'client'),
    `/client/bookings?open=${bookingId}&section=billing`)
  assert.equal(notificationDestination({ type: 'job_order', bookingId, eventKey: 'additional-work:request:sent_to_client' }, 'client'),
    `/client/bookings?open=${bookingId}&section=additional-work`)
  assert.equal(notificationDestination({ type: 'maintenance_reminder' }, 'client'), '/client/reminders')
  assert.equal(notificationDestination({ type: 'maintenance_reminder', maintenanceReminderId: bookingId }, 'client'), `/client/reminders?open=${bookingId}`)
});

test('system destinations cannot cross roles or navigate to arbitrary paths', () => {
  assert.equal(notificationDestination({ type: 'system', path: '/admin/service-bays' }, 'admin'), '/admin/service-bays')
  assert.equal(notificationDestination({ type: 'system', path: '/admin/service-bays' }, 'client'), '')
  assert.equal(notificationDestination({ type: 'system', path: 'https://example.com' }, 'admin'), '')
});
