export function dateLabel(value) {
  if (!value) return 'Date unavailable'
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`))
}
export function money(value) { return `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }
export function remaining(slot) { return Math.max(0, slot.maximumCapacity - slot.currentBookingCount) }
export function futureSlot(slot) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map(part => [part.type, part.value]))
  return `${slot.date}T${slot.timeSlot}` > `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}
