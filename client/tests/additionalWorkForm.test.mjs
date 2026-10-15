import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evidenceError, proposalFormError } from '../src/utils/additionalWorkForm.js'

const service = { _id: 'service-1', estimatedPrice: 1200.25 }
const base = { title: 'Worn front brake pads', description: 'Brake pads need replacement before further service.',
  services: [service], lines: [{ kind: 'part', name: 'Brake Pad Set', quantity: '2' }] }

test('proposal form validates descriptive Service and Part items without prices', () => {
  assert.equal(proposalFormError(base), '')
  assert.match(proposalFormError({ ...base, title: 'x' }), /Issue title/)
  assert.match(proposalFormError({ ...base, description: 'short' }), /Issue description/)
  assert.match(proposalFormError({ ...base, lines: [{ ...base.lines[0], quantity: '1.5' }] }), /quantity/)
  const linked = { ...base, lines: [{ kind: 'service', serviceId: 'service-1', quantity: '2' }] }
  assert.equal(proposalFormError(linked), '')
  assert.match(proposalFormError({ ...linked, services: [] }), /service or part/)
})

test('evidence preview accepts only bounded JPEG, PNG and WebP files', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) assert.equal(evidenceError({ type, size: 1024 }), '')
  assert.match(evidenceError({ type: 'application/pdf', size: 1024 }), /JPEG/)
  assert.match(evidenceError({ type: 'image/png', size: 8 * 1024 * 1024 + 1 }), /8 MB/)
})
