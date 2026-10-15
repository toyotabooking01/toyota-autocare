import { passwordError, MOBILE_PATTERN, MOBILE_HINT, CONSENT_HINT, registrationNameFields, REGISTRATION_MOBILE_HINT, canonicalPlateNumber } from '../../../shared/accountValidation.mjs'
// Client form schemas; account policy comes from the shared browser-safe module.
const text = (label, max, required = true) => ({ label, max, required })
const number = (label, min, max, required = true, integer = true) => ({ label, min, max, required, number: true, integer })
const select = (label, choices) => ({ label, choices, required: true })
const fullName = { ...text('Full name', 120), pattern: /\p{L}/u, hint: 'Full name must contain letters.' }
const email = { ...text('Email', 254), email: true }
const phone = { ...text('Mobile number', 20), pattern: MOBILE_PATTERN, hint: MOBILE_HINT }
const password = { ...text('Password', 72), password: true }
const id = label => ({ ...text(label, 24), pattern: /^[a-f\d]{24}$/i, hint: `Select a valid ${label.toLowerCase()}.` })
export const schemas = {
  accountProfile: { fullName, email, phone, address: text('Address', 300, false) },
  walkInClient: { ...registrationNameFields, email: { ...email, required: false },
    phone: { ...phone, hint: REGISTRATION_MOBILE_HINT }, address: text('Address', 300, false) },
  clientRegistration: { ...registrationNameFields, email, phone: { ...phone, hint: REGISTRATION_MOBILE_HINT }, password, confirmPassword: text('Confirm password', 72), termsAccepted: { consent: true } },
  login: { email, password: { ...password, login: true } },
  email: { email },
  register: { fullName, email, phone, password, confirmPassword: text('Confirm password', 72), termsAccepted: { consent: true } },
  reset: { newPassword: password, confirmPassword: text('Confirm password', 72) },
  otp: { email, otp: { ...text('Verification code', 6), pattern: /^\d{6}$/, hint: 'Enter all six digits.' } },
  mechanic: { fullName, email, phone: { ...phone, label: 'Philippine mobile number', required: true, hint: REGISTRATION_MOBILE_HINT },
    status: select('Account status', ['active', 'inactive']), availability: select('Availability', ['available', 'busy', 'off_duty']) },
  mechanicCreate: { firstName: registrationNameFields.firstName, lastName: registrationNameFields.lastName,
    email, phone: { ...phone, label: 'Philippine mobile number', hint: REGISTRATION_MOBILE_HINT } },
  mechanicNamedEdit: { firstName: registrationNameFields.firstName, lastName: registrationNameFields.lastName,
    email, phone: { ...phone, label: 'Philippine mobile number', hint: REGISTRATION_MOBILE_HINT },
    status: select('Account status', ['active', 'inactive']), availability: select('Availability', ['available', 'busy', 'off_duty']) },
  staff: { firstName: registrationNameFields.firstName, lastName: registrationNameFields.lastName,
    email, phone: { ...phone, hint: REGISTRATION_MOBILE_HINT } },
  vehicle: { make: text('Make', 80), model: text('Model', 80), year: number('Year', 1886, new Date().getUTCFullYear() + 1), variant: text('Variant', 120, false),
    plateNumber: { ...text('Plate number', 30), plate: true }, transmission: select('Transmission', ['manual', 'automatic', 'cvt']),
    currentMileage: number('Mileage', 0, 9999999, false) },
  clientVehicle: { make: text('Make', 80), model: text('Model', 80), year: { ...number('Year', 1886, new Date().getUTCFullYear()), digits: true }, variant: text('Variant', 120, false),
    plateNumber: { ...text('Plate number', 30), plate: true }, transmission: select('Transmission', ['manual', 'automatic', 'cvt']),
    currentMileage: { ...number('Current mileage', 0, 9999999), digits: true } },
  service: { name: text('Name', 120), description: text('Description', 3000, false), estimatedDuration: number('Duration', 1, 525600),
    estimatedPrice: number('Estimated price', 0, 999999999.99, true, false), maintenanceReminderInterval: { ...number('Reminder interval', 1, 36500, false), nullable: true } },
  bay: { name: text('Name', 80), operationalStatus: select('Operational status', ['operational', 'maintenance', 'out_of_service']) },
  schedule: { date: { ...text('Date', 10), date: true }, timeSlot: { ...text('Time', 5), pattern: /^([01]\d|2[0-3]):[0-5]\d$/, hint: 'Use a valid HH:MM time.' }, maximumCapacity: number('Capacity', 1, 10000) },
  booking: { vehicle: id('Vehicle'), schedule: id('Schedule'), concern: text('Concern', 3000, false) },
  assignment: { mechanic: id('Mechanic'), serviceBay: id('Service bay') },
  work: { mechanicNotes: text('Service notes', 5000, false) },
  report: { from: { ...text('From date', 10), date: true }, to: { ...text('To date', 10), date: true } },
}
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
function validEmail(value) {
  if (!/^[^\s@<>,;:"\\]+@[^\s@<>,;:"\\]+\.[^\s@<>,;:"\\]+$/.test(value)) return false
  const [local, domain] = value.split('@')
  return local.length <= 64 && !local.startsWith('.') && !local.endsWith('.') && !local.includes('..')
    && domain.split('.').every(label => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label))
}
export function validateForm(kind, values, { partial = false, browser = false, skip = [], existingPlate } = {}) {
  const errors = {}
  for (const [field, rule] of Object.entries(schemas[kind])) {
    if (skip.includes(field) || (partial && !(field in values))) continue
    if (rule.consent) { if (values[field] !== true) errors[field] = CONSENT_HINT; continue }
    const raw = values[field]
    const value = typeof raw === 'string' ? raw.trim() : raw
    if (value === undefined || value === null || value === '') {
      if (rule.required) errors[field] = `${rule.label} is required.`
      else if (raw === null && !rule.nullable) errors[field] = `${rule.label} must be ${rule.number ? 'a number' : 'text'}.`
      else if (!browser && rule.number && typeof raw === 'string') errors[field] = `${rule.label} must be a number.`
      continue
    }
    if (rule.number) {
      const numeric = browser && typeof value === 'string' ? Number(value) : value
      if ((browser && rule.digits && typeof value === 'string' && !/^\d+$/.test(value))
        || typeof numeric !== 'number' || !Number.isFinite(numeric) || (rule.integer && !Number.isSafeInteger(numeric)) || numeric < rule.min || numeric > rule.max) {
        errors[field] = `${rule.label} must be ${rule.integer ? 'a whole number' : 'a number'} between ${rule.min} and ${rule.max}.`
      }
    } else if (typeof raw !== 'string') errors[field] = `${rule.label} must be text.`
    else if (rule.password) {
      const message = passwordError(raw, { login: rule.login })
      if (message) errors[field] = message
    } else if (value.length > rule.max) errors[field] = `${rule.label} must be at most ${rule.max} characters.`
    else if (rule.email && !validEmail(value)) errors[field] = 'Enter a valid email address.'
    else if (rule.choices && !rule.choices.includes(value)) errors[field] = `Select a valid ${rule.label.toLowerCase()}.`
    else if (rule.pattern && !rule.pattern.test(rule.compact ? value.replace(/[ ()-]/g, '') : value)) errors[field] = rule.hint
    else if (rule.plate && !canonicalPlateNumber(value, { existingPlate })) errors[field] = 'Enter a valid Philippine plate number.'
    else if (rule.date && !validDate(value)) errors[field] = `${rule.label} must be a valid calendar date.`
  }
  if (['register', 'clientRegistration', 'reset'].includes(kind) && values.confirmPassword !== (values.password ?? values.newPassword)) errors.confirmPassword = 'Password confirmation does not match.'
  if (kind === 'report' && !errors.from && !errors.to) {
    const days = (new Date(values.to) - new Date(values.from)) / 86400000
    if (days < 0 || days > 366) errors.to = 'End date must follow the start date within a range of at most 367 days.'
  }
  if (kind === 'booking' && (!partial || 'services' in values)) {
    if (!Array.isArray(values.services) || !values.services.length || values.services.length > 20 || new Set(values.services).size !== values.services.length || values.services.some(value => typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value))) errors.services = 'Select 1 to 20 distinct available services.'
  }
  if (kind === 'work' && 'serviceChecklist' in values) {
    if (!Array.isArray(values.serviceChecklist) || values.serviceChecklist.length > 30) errors.serviceChecklist = 'Checklist allows up to 30 items.'
    else values.serviceChecklist.forEach((item, index) => {
      if (!item || typeof item.description !== 'string' || !item.description.trim() || item.description.trim().length > 500 || typeof item.isCompleted !== 'boolean') errors.serviceChecklist = `Checklist item ${index + 1} needs 1 to 500 characters and a valid completion state.`
    })
  }
  if (kind === 'clientRegistration' && errors.phone) errors.phone = REGISTRATION_MOBILE_HINT
  return errors
}
