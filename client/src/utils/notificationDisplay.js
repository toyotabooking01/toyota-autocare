export function notificationDestination(item, role) {
  if (item.type === 'maintenance_reminder') return ['client', 'admin'].includes(role) ? `/${role}/reminders` : ''
  if (item.type === 'booking') return role === 'mechanic' ? '/mechanic/jobs'
    : ['client', 'staff', 'admin'].includes(role) ? `/${role}/bookings` : ''
  if (item.type === 'job_order') return role === 'client' ? '/client/bookings'
    : role === 'mechanic' ? '/mechanic/jobs'
      : ['staff', 'admin'].includes(role) ? `/${role}/job-orders` : ''
  return ''
}

export function notificationTime(value, now = Date.now()) {
  const timestamp = new Date(value).getTime()
  if (!value || !Number.isFinite(timestamp)) return ''
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (seconds < 60) return 'Just now'
  const [unit, amount] = seconds < 3600 ? ['minute', Math.floor(seconds / 60)]
    : seconds < 86400 ? ['hour', Math.floor(seconds / 3600)] : ['day', Math.floor(seconds / 86400)]
  return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(-amount, unit)
}
