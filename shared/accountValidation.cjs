// Generated from shared/accountValidation.mjs; do not edit.
// Regenerate: node server/scripts/generate-validation-cjs.js
// Browser-safe account policy shared by the client and API.
const PASSWORD_HINT = 'Use at least 12 characters with uppercase, lowercase, number, and special character.'
const MOBILE_HINT = 'Enter a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX).'
const CONSENT_HINT = 'Please agree to the Terms of Service and Privacy Policy.'
const MOBILE_PATTERN = /^(?:09\d{9}|\+639\d{9})$/
const REGISTRATION_MOBILE_HINT = 'Enter a valid Philippine mobile number.'
const NAME_SUFFIXES = ['', 'Jr.', 'Sr.', 'II', 'III', 'IV']
const name = (label, max, required = true) => ({ label, max, required,
  pattern: /^(?=.*\p{L})[\p{L}\p{M} .’'\-]+$/u, hint: `Enter a valid ${label.toLowerCase()}.` })
const registrationNameFields = {
  firstName: name('First name', 40), lastName: name('Last name', 40),
  middleName: name('Middle name or initial', 30, false),
  suffix: { label: 'Suffix', max: 3, required: false, choices: NAME_SUFFIXES },
}
function registrationNames(values) {
  const names = Object.fromEntries(['firstName', 'middleName', 'lastName', 'suffix'].map(key => [key, (values[key] || '').trim().replace(/\s+/g, ' ')]))
  return { ...names, fullName: Object.values(names).filter(Boolean).join(' ') }
}
function restrictMobileInput(value) {
  const clean = value.replace(/[^\d+]/g, '')
  const international = clean.startsWith('+')
  const digits = clean.replace(/\D/g, '')
  return international ? `+${digits.slice(0, 12)}` : digits.slice(0, 11)
}
function passwordRequirements(value = '') {
  return [
    { label: 'At least 12 characters', met: Array.from(value).length >= 12 },
    { label: 'One uppercase letter', met: /[A-Z]/.test(value) },
    { label: 'One lowercase letter', met: /[a-z]/.test(value) },
    { label: 'One number', met: /[0-9]/.test(value) },
    { label: 'One special character', met: /[^\p{L}\p{N}\s]/u.test(value) },
  ]
}

// Retain bcrypt's input bound, without exposing implementation details in the UI.
function passwordError(value, { login = false } = {}) {
  if (typeof value !== 'string' || !value.trim()) return 'Password is required.'
  if (new TextEncoder().encode(value).length > 72) return 'This password is too long. Please use a shorter one.'
  if (!login && !passwordRequirements(value).every(rule => rule.met)) return PASSWORD_HINT
  return ''
}

function normalizeMobile(value) {
  if (typeof value !== 'string') return value
  const mobile = value.trim()
  // Only normalize accepted formats; never repair invalid input into a valid number.
  return MOBILE_PATTERN.test(mobile) && mobile.startsWith('09') ? `+63${mobile.slice(1)}` : mobile
}

function normalizePlateInput(value) {
  const clean = String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const letters = (/^[A-Z]*/.exec(clean)[0]).slice(0, 3)
  if (letters.length < 3) return letters
  const firstDigit = clean.search(/[0-9]/)
  const digits = firstDigit < 0 ? '' : clean.slice(firstDigit).replace(/[^0-9]/g, '').slice(0, 4)
  return digits ? `${letters} ${digits}` : letters
}

// Validation normalization must never truncate or repair an invalid raw plate.
function normalizePlateForValidation(value) {
  return value.toUpperCase().trim().replace(/ +/g, ' ').replace(/^([A-Z]{3})([0-9]+)$/, '$1 $2')
}

// LTO private motor-vehicle series and optional motor-vehicle special plates.
// https://www.lto.gov.ph/wp-content/uploads/2023/10/praos_18feb2015.pdf
// https://lto.gov.ph/wp-content/uploads/2023/10/FDM-vol.-2-2nd-Edition.pdf
const PH_MOTOR_VEHICLE_PLATE = /^[A-Z]{3} [0-9]{3,4}$/
const PLATE_FORMAT_ERROR = 'Enter a valid Philippine plate number.'
function hasUnsupportedPlateSymbols(value) {
  return typeof value !== 'string' || /[^a-zA-Z0-9 ]/.test(value)
}

// Existing OMVSP records only; never a general-purpose alphanumeric fallback.
// https://lto.gov.ph/wp-content/uploads/2023/08/Memo_08102023.pdf
function legacyPlateNumber(value) {
  if (hasUnsupportedPlateSymbols(value)) return ''
  const normalized = normalizePlateForValidation(value)
  return /^[A-Z]{3} (?!00$)[0-9]{2}$/.test(normalized) ? normalized : ''
}

function canonicalPlateNumber(value, { existingPlate } = {}) {
  if (hasUnsupportedPlateSymbols(value)) return ''
  const normalized = normalizePlateForValidation(value)
  if (PH_MOTOR_VEHICLE_PLATE.test(normalized)) return normalized
  const legacy = legacyPlateNumber(existingPlate)
  return legacy && normalized === legacy ? legacy : ''
}

module.exports = { PASSWORD_HINT, MOBILE_HINT, CONSENT_HINT, MOBILE_PATTERN, REGISTRATION_MOBILE_HINT, NAME_SUFFIXES, registrationNameFields, registrationNames, restrictMobileInput, passwordRequirements, passwordError, normalizeMobile, normalizePlateInput, PH_MOTOR_VEHICLE_PLATE, PLATE_FORMAT_ERROR, hasUnsupportedPlateSymbols, legacyPlateNumber, canonicalPlateNumber };
