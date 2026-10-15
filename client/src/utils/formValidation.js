import { schemas, validateForm } from './validationRules.js'
import { futureSlot, remaining } from '../pages/bookingDisplay.js'

// Additional checks for browser input and loaded UI options.
export function validateClientForm(kind, values, options = {}) {
  const errors = validateForm(kind, values, { ...options, browser: true })
  if (options.requireVariant && !String(values.variant || '').trim()) errors.variant = 'Variant is required.'
  for (const [field, rule] of Object.entries(schemas[kind])) {
    if (options.skip?.includes(field)) continue
    const value = values[field]
    if (rule.number && typeof value === 'string' && value.trim()
      && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) {
      errors[field] = `${rule.label} must be a valid number.`
    }
  }
  if (kind === 'schedule') {
    if (!errors.date && !errors.timeSlot && !futureSlot(values)) errors.timeSlot = 'Schedule must be in the future.'
    const original = options.schedule
    if (original?.currentBookingCount > 0) {
      if (!errors.date && values.date !== original.date) errors.date = 'A reserved schedule cannot change its date.'
      if (!errors.timeSlot && values.timeSlot !== original.timeSlot) errors.timeSlot = 'A reserved schedule cannot change its time.'
      if (!errors.maximumCapacity && Number(values.maximumCapacity) < original.currentBookingCount) errors.maximumCapacity = 'Capacity cannot be lower than the current booked count.'
    }
  }
  if (kind === 'booking' && options.available) {
    const available = options.available || {}
    const skipped = options.skip || []
    const checkSelection = (field, selected, message) => {
      if (skipped.includes(field) || selected === undefined || selected === null || selected === '') return
      const choices = available[field]
      if (!Array.isArray(choices)) {
        errors[field] = 'Could not verify this selection. Please try again.'
      } else if (!choices.some(item => item?._id === selected)) {
        errors[field] = message
      }
    }
    if ('client' in values) checkSelection('client', values.client, 'Select an available customer.')
    checkSelection('vehicle', values.vehicle, 'Select an available vehicle.')
    if (Array.isArray(values.services)) {
      const serviceOptions = available.services
      if (values.services.length && !Array.isArray(serviceOptions)) {
        errors.services = 'Could not verify the selected services. Please try again.'
      } else if (values.services.some(id => !serviceOptions.some(item => item?._id === id))) {
        errors.services = 'One or more selected services are unavailable. Update your selection.'
      }
    }
    if (!skipped.includes('schedule')) {
      const scheduleOptions = available.schedule
      const slot = Array.isArray(scheduleOptions) ? scheduleOptions.find(item => item?._id === values.schedule) : null
      if (!slot || slot.isEnabled === false || !futureSlot(slot) || remaining(slot) <= 0) {
        errors.schedule = Array.isArray(scheduleOptions)
          ? 'Choose an available future schedule with remaining capacity.'
          : 'Could not verify the schedule. Please try again.'
      }
    }
  }
  if (kind === 'assignment' && options.available) {
    for (const field of ['mechanic', 'serviceBay']) {
      const choices = options.available?.[field]
      if (!Array.isArray(choices) || !choices.some(item => item?._id === values[field])) {
        errors[field] = `Select an available ${field === 'mechanic' ? 'mechanic' : 'service bay'}.`
      }
    }
  }
  return errors
}

export function visibleRemoteErrors(kind, values, remote, snapshot) {
  return Object.fromEntries(Object.entries(remote).filter(([key]) => {
    const related = kind === 'schedule' && ['date', 'timeSlot'].includes(key) ? ['date', 'timeSlot']
      : kind === 'report' && ['from', 'to'].includes(key) ? ['from', 'to']
      : key === 'confirmPassword' ? ['confirmPassword', kind === 'reset' ? 'newPassword' : 'password'] : [key]
    return related.every(field => JSON.stringify(values[field]) === JSON.stringify(snapshot[field]))
  }))
}
