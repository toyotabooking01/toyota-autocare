export function manilaToday(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
export function vehicleName(vehicle) {
  return vehicle ? `${vehicle.make} ${vehicle.model} ${vehicle.year}` : 'Vehicle record unavailable'
}
export function bookingPreview(booking) {
  return { id: booking._id, vehicle: vehicleName(booking.vehicle), customer: booking.client?.fullName || '',
    service: (booking.services || []).map(item => item?.name).filter(Boolean).join(', ') || 'Service unavailable',
    time: `${booking.bookingDate} · ${booking.bookingTime}`, bay: booking.assignedServiceBay?.name || (booking.assignedServiceBay ? 'Assigned bay' : 'Unassigned'), status: booking.status }
}
export function jobPreview(job) {
  const booking = job.booking || {}
  return { id: job._id, vehicle: vehicleName(booking.vehicle), customer: booking.client?.fullName || '',
    service: (booking.services || []).map(item => item?.name).filter(Boolean).join(', ') || 'Service unavailable',
    time: `${booking.bookingDate || ''} · ${booking.bookingTime || ''}`, bay: job.serviceBay?.name || 'Unassigned', status: booking.status }
}
