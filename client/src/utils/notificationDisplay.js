export function notificationDestination(item, role) {
  if (item.type === 'system') {
    const allowed = {
      admin: ['/admin/mechanics', '/admin/staff', '/admin/service-bays', '/admin/bookings', '/admin/job-orders'],
      staff: ['/staff/profile'], mechanic: ['/mechanic/profile'], client: ['/client/profile'],
    }
    return allowed[role]?.includes(item.path) ? item.path : ''
  }
  if (item.type === 'maintenance_reminder') {
    const reminder = /^[a-f\d]{24}$/i.test(String(item.maintenanceReminderId || '')) ? `?open=${item.maintenanceReminderId}` : ''
    return ['client', 'admin'].includes(role) ? `/${role}/reminders${reminder}` : ''
  }
  const booking = /^[a-f\d]{24}$/i.test(String(item.bookingId || '')) ? `?open=${item.bookingId}` : ''
  const job = /^[a-f\d]{24}$/i.test(String(item.jobOrderId || '')) ? `?open=${item.jobOrderId}` : ''
  const bookingSection = section => booking ? `${booking}&section=${section}` : ''
  if (item.type === 'booking') return role === 'mechanic' ? '/mechanic/jobs'
    : ['client', 'staff', 'admin'].includes(role) ? `/${role}/bookings${booking}` : ''
  if (item.type === 'payment') return ['client', 'staff', 'admin'].includes(role) ? `/${role}/bookings${bookingSection('payment')}` : ''
  const clientSection = String(item.eventKey || '').includes(':ready_for_release') ? 'billing'
    : String(item.eventKey || '').startsWith('additional-work:') ? 'additional-work' : ''
  if (item.type === 'job_order') return role === 'client' ? `/client/bookings${clientSection ? bookingSection(clientSection) : booking}`
    : role === 'mechanic' ? `/mechanic/jobs${job}`
      : ['staff', 'admin'].includes(role) ? `/${role}/job-orders${job}` : ''
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
