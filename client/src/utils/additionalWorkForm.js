const validQty = value => /^[1-9]\d*$/.test(String(value)) && Number(value) <= 1000

export function evidenceError(file) {
  if (!file) return ''
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size < 1 || file.size > 8 * 1024 * 1024)
    return 'Choose a JPEG, PNG, or WebP image up to 8 MB.'
  return ''
}

export function proposalFormError({ title, description, lines, services }) {
  if (title.trim().length < 5 || title.trim().length > 120) return 'Issue title must be 5 to 120 characters.'
  if (description.trim().length < 15 || description.trim().length > 2000) return 'Issue description must be 15 to 2,000 characters.'
  if (!lines.length || lines.length > 20) return 'Add 1 to 20 service or part items.'
  if (lines.some(line => !validQty(line.quantity))) return 'Each quantity must be a whole number from 1 to 1,000.'
  if (lines.some(line => line.kind === 'service' ? !services.some(service => service._id === line.serviceId)
    : line.kind !== 'part' || line.name.trim().length < 2 || line.name.trim().length > 120))
    return 'Complete each service or part.'
  return ''
}
