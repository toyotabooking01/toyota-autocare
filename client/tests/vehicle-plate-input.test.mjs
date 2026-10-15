import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizePlateInput } from '../../shared/accountValidation.mjs'
import { validateForm } from '../src/utils/validationRules.js'
import { validateClientForm } from '../src/utils/formValidation.js'

test('plate input normalizes case and repeated spaces while typing and trims on blur', () => {
  assert.equal(normalizePlateInput('abc 1234'), 'ABC 1234')
  assert.equal(normalizePlateInput('naa   123'), 'NAA 123')
  assert.equal(normalizePlateInput('  abc 1234  '), 'ABC 1234')
  assert.equal(normalizePlateInput('  abc 1234  ', { trim: true }), 'ABC 1234')
  assert.equal(normalizePlateInput('naa 123', { trim: true }), 'NAA 123')
})

test('plate input limits letters and digits without relying on HTML maxLength', () => {
  for (const [raw, expected] of [
    ['abc1234', 'ABC 1234'], ['abcd1234', 'ABC 1234'],
    ['abc12345', 'ABC 1234'], ['DSDSADADASDAD', 'DSD'],
    ['ABCDEF', 'ABC'], ['1234567', ''], ['ab1234', 'AB'],
    ['abc-1234', 'ABC 1234'], ['abc@1234', 'ABC 1234'],
    ['ABC 12X34Z5', 'ABC 1234'], ['abc12', 'ABC 12'],
  ]) {
    const sanitized = normalizePlateInput(raw)
    assert.equal(sanitized, expected)
    assert.ok(sanitized.length <= 8)
    assert.match(sanitized, /^(?:[A-Z]{0,3}|[A-Z]{3} [0-9]{1,4})$/)
  }
  const valid = { make: 'Toyota', model: 'Vios', year: '2025', plateNumber: 'ABC 1234', transmission: 'cvt', currentMileage: '0' }
  for (const plateNumber of ['DSDSADADASDAD', 'ABCD 1234', 'ABC 12345', 'ABCDEF', '1234567', 'ABC-1234', 'ABC@1234']) {
    assert.equal(validateClientForm('clientVehicle', { ...valid, plateNumber }).plateNumber, 'Enter a valid Philippine plate number.')
  }
})

test('Add and Edit vehicle validation requires every field and accepts only current years and whole mileage', () => {
  const valid = { make: 'Toyota', model: 'Vios', year: '2025', variant: '1.3 XLE CVT', plateNumber: 'ABC 1234', transmission: 'cvt', currentMileage: '0' }
  assert.deepEqual(validateForm('clientVehicle', valid, { browser: true }), {})
  for (const field of Object.keys(valid).filter(field => field !== 'variant')) {
    assert.ok(validateForm('clientVehicle', { ...valid, [field]: ' ' }, { browser: true })[field], `${field} should be required`)
  }
  assert.ok(validateClientForm('clientVehicle', { ...valid, variant: ' ' }, { requireVariant: true }).variant)
  assert.equal(validateClientForm('clientVehicle', { ...valid, year: '2020', variant: '' }).variant, undefined)
  assert.ok(validateForm('clientVehicle', { ...valid, make: '   ' }, { browser: true }).make)
  assert.ok(validateForm('clientVehicle', { ...valid, model: '   ' }, { browser: true }).model)
  assert.ok(validateForm('clientVehicle', { ...valid, year: String(new Date().getUTCFullYear() + 1) }, { browser: true }).year)
  assert.ok(validateForm('clientVehicle', { ...valid, year: '20e4' }, { browser: true }).year)
  for (const currentMileage of ['-1', '1.5', '1e2', 'letters', '10000000']) {
    assert.ok(validateForm('clientVehicle', { ...valid, currentMileage }, { browser: true }).currentMileage, `${currentMileage} should be rejected`)
  }
  assert.ok(validateForm('clientVehicle', { ...valid, transmission: 'unknown' }, { browser: true }).transmission)
})
