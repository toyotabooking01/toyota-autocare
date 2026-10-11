// Browser-safe account policy shared by the client and API.
export const PASSWORD_HINT = 'Use at least 12 characters with uppercase, lowercase, number, and special character.'
export const MOBILE_HINT = 'Enter a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX).'
export const CONSENT_HINT = 'Please agree to the Terms of Service and Privacy Policy.'
export const MOBILE_PATTERN = /^(?:09\d{9}|\+639\d{9})$/
export const REGISTRATION_MOBILE_HINT = 'Enter a valid Philippine mobile number.'
export const NAME_SUFFIXES = ['', 'Jr.', 'Sr.', 'II', 'III', 'IV']
const name = (label, max, required = true) => ({ label, max, required,
  pattern: /^(?=.*\p{L})[\p{L}\p{M} .’'\-]+$/u, hint: `Enter a valid ${label.toLowerCase()}.` })
export const registrationNameFields = {
  firstName: name('First name', 40), lastName: name('Last name', 40),
  middleName: name('Middle name or initial', 30, false),
  suffix: { label: 'Suffix', max: 3, required: false, choices: NAME_SUFFIXES },
}
export function registrationNames(values) {
  const names = Object.fromEntries(['firstName', 'middleName', 'lastName', 'suffix'].map(key => [key, (values[key] || '').trim().replace(/\s+/g, ' ')]))
  return { ...names, fullName: Object.values(names).filter(Boolean).join(' ') }
}
export function restrictMobileInput(value) {
  const clean = value.replace(/[^\d+]/g, '')
  const international = clean.startsWith('+')
  const digits = clean.replace(/\D/g, '')
  return international ? `+${digits.slice(0, 12)}` : digits.slice(0, 11)
}
export function passwordRequirements(value = '') {
  return [
    { label: 'At least 12 characters', met: Array.from(value).length >= 12 },
    { label: 'One uppercase letter', met: /[A-Z]/.test(value) },
    { label: 'One lowercase letter', met: /[a-z]/.test(value) },
    { label: 'One number', met: /[0-9]/.test(value) },
    { label: 'One special character', met: /[^\p{L}\p{N}\s]/u.test(value) },
  ]
}

// Retain bcrypt's input bound, without exposing implementation details in the UI.
export function passwordError(value, { login = false } = {}) {
  if (typeof value !== 'string' || !value.trim()) return 'Password is required.'
  if (new TextEncoder().encode(value).length > 72) return 'This password is too long. Please use a shorter one.'
  if (!login && !passwordRequirements(value).every(rule => rule.met)) return PASSWORD_HINT
  return ''
}

export function normalizeMobile(value) {
  if (typeof value !== 'string') return value
  const mobile = value.trim()
  // Only normalize accepted formats; never repair invalid input into a valid number.
  return MOBILE_PATTERN.test(mobile) && mobile.startsWith('09') ? `+63${mobile.slice(1)}` : mobile
}

export function normalizePlateInput(value, { trim = false } = {}) {
  const normalized = String(value ?? '').toUpperCase().replace(/\s+/g, ' ')
  return trim ? normalized.trim() : normalized.trimStart()
}
