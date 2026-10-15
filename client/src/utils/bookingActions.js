export function bookingActionKinds(booking, role, now = new Date()) {
  const operator = role === 'staff' || role === 'admin'
  const client = role === 'client'
  if (booking.status === 'awaiting_downpayment') return (client || operator) && booking.holdStatus === 'active' ? ['cancel'] : []
  if (booking.status === 'pending') return operator ? ['confirm', 'reject', 'cancel'] : client ? ['cancel'] : []
  if (booking.status === 'confirmed') return operator
    ? ['check-in', ...(new Date(`${booking.bookingDate}T${booking.bookingTime}:00+08:00`) <= now ? ['no-show'] : []), 'cancel']
    : client ? ['cancel'] : []
  if (booking.status === 'checked_in') return operator ? ['assign'] : []
  return []
}

export function canReviewPayment(payment, role) {
  return ['staff', 'admin'].includes(role) && payment.status === 'submitted'
}
