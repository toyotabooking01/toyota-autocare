const labels = { available: 'Available', busy: 'Busy', off_duty: 'Off Duty' }

export function mechanicAvailabilityLabel(value) {
  return labels[value] || 'Unknown'
}
