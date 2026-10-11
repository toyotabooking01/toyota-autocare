import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizePlateInput } from '../../shared/accountValidation.mjs'
import { validateForm } from '../src/utils/validationRules.js'

test('plate input normalizes case and repeated spaces while typing and trims on blur', () => {
  assert.equal(normalizePlateInput('abc 1234'), 'ABC 1234')
  assert.equal(normalizePlateInput('naa   123'), 'NAA 123')
  assert.equal(normalizePlateInput('  abc 1234  '), 'ABC 1234 ')
  assert.equal(normalizePlateInput('  abc 1234  ', { trim: true }), 'ABC 1234')
  assert.equal(normalizePlateInput('naa 123', { trim: true }), 'NAA 123')
})

test('Add and Edit vehicle validation requires every field and accepts only current years and whole mileage', () => {
  const valid = { make: 'Toyota', model: 'Vios', year: '2024', plateNumber: 'ABC 1234', transmission: 'automatic', currentMileage: '0' }
  assert.deepEqual(validateForm('clientVehicle', valid, { browser: true }), {})
  for (const field of Object.keys(valid)) {
    assert.ok(validateForm('clientVehicle', { ...valid, [field]: ' ' }, { browser: true })[field], `${field} should be required`)
  }
  assert.ok(validateForm('clientVehicle', { ...valid, make: '   ' }, { browser: true }).make)
  assert.ok(validateForm('clientVehicle', { ...valid, model: '   ' }, { browser: true }).model)
  assert.ok(validateForm('clientVehicle', { ...valid, year: String(new Date().getUTCFullYear() + 1) }, { browser: true }).year)
  assert.ok(validateForm('clientVehicle', { ...valid, year: '20e4' }, { browser: true }).year)
  for (const currentMileage of ['-1', '1.5', '1e2', 'letters', '10000000']) {
    assert.ok(validateForm('clientVehicle', { ...valid, currentMileage }, { browser: true }).currentMileage, `${currentMileage} should be rejected`)
  }
  assert.ok(validateForm('clientVehicle', { ...valid, transmission: 'unknown' }, { browser: true }).transmission)
})
