export const TOKEN_KEY = 'toyota-autocare.access'
export const FLOW_KEY = 'toyota-autocare.email-flow'
export const dashboards = { client: '/client/dashboard', mechanic: '/mechanic/dashboard', admin: '/admin/dashboard' }
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
  if (!error.response) return 'Unable to reach AutoCare. Check your connection and try again.'
  if (error.response.status === 429) return 'Too many attempts. Please wait a few minutes before trying again.'
  if (error.response.status >= 500) return 'We could not complete that request. Please try again shortly.'
  return error.response.data?.message || 'Something went wrong. Please try again.'
}
export function passwordError(password, confirmation) {
  if (password.length < 12 || new TextEncoder().encode(password).length > 72) return 'Use at least 12 characters and no more than 72 UTF-8 bytes.'
  if (password !== confirmation) return 'Your passwords do not match.'
  return ''
}
