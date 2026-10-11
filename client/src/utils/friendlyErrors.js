const fallback = 'We could not complete that request. Please try again.'
const technical = /Mongo(?:DB|Server|Network|Error)|mongoose|E11000|duplicate key|CastError|ValidationError|ObjectId|BSON|\bSMTP\b|\bUTF-?8\b|\bbytes?\b|bcrypt|stack trace|node_modules|\bat\s+\S+\s*\([^)]*:\d+|<[^>]+>|\b(?:ECONN\w*|ETIMEDOUT|ENOTFOUND)\b/i
export function friendlyText(value, alternate = fallback) {
  return typeof value === 'string' && value.trim() && value.length <= 300 && !technical.test(value) ? value.trim() : alternate
}
export function friendlyError(error) {
  if (!error?.response) return 'Unable to reach AutoCare. Check your connection and try again.'
  if (error.response.status === 429) return 'Too many attempts. Please wait a few minutes before trying again.'
  if (error.response.status >= 500) return fallback
  return friendlyText(error.response.data?.message)
}
export function friendlyFieldErrors(raw, allowed) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return Object.fromEntries(Object.entries(raw).filter(([key]) => allowed.includes(key))
    .map(([key, value]) => [key, friendlyText(value, 'Please check this field.')]))
}
