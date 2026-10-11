import { validateForm } from '../utils/validationRules.js'
import { friendlyError } from '../utils/friendlyErrors.js'

export const TOKEN_KEY = 'toyota-autocare.access'
export const FLOW_KEY = 'toyota-autocare.email-flow'
export const dashboards = { client: '/client/dashboard', mechanic: '/mechanic/dashboard', admin: '/admin/dashboard' }
export const accountHome = user => dashboards[user?.role]
  ? user.mustChangePassword ? '/change-password' : dashboards[user.role]
  : '/login'
export function readStored(key) {
  try { return sessionStorage.getItem(key) } catch { return null }
}
export function store(key, value) {
  try {
    if (value === null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, value)
  } catch { /* The current in-memory session still works if storage is unavailable. */ }
}
export function readFlow() {
  try { return JSON.parse(readStored(FLOW_KEY)) || {} } catch { return {} }
}
export function errorMessage(error) {
  return friendlyError(error)
}
export function passwordError(password, confirmation) {
  return Object.values(validateForm('reset', { newPassword: password, confirmPassword: confirmation }))[0] || ''
}
