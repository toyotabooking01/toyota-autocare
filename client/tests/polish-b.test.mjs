import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accountHome } from '../src/auth/session.js'
import { validateForm } from '../src/utils/validationRules.js'
import { restrictMobileInput } from '../../shared/accountValidation.mjs'

test('forced accounts route to password change and cleared accounts retain their role dashboard', () => {
  assert.equal(accountHome({ role: 'client', mustChangePassword: true }), '/change-password')
  assert.equal(accountHome({ role: 'client', mustChangePassword: false }), '/client/dashboard')
  assert.equal(accountHome({ role: 'mechanic', mustChangePassword: true }), '/change-password')
  assert.equal(accountHome({ role: 'mechanic', mustChangePassword: false }), '/mechanic/dashboard')
  assert.equal(accountHome({ role: 'client' }), '/client/dashboard')
  assert.equal(accountHome({ role: 'admin' }), '/admin/dashboard')
  assert.equal(accountHome(null), '/login')
  assert.equal(accountHome({ mustChangePassword: false }), '/login')
  assert.equal(accountHome({ role: 'unknown', mustChangePassword: false }), '/login')
})
test('mechanic creation requires separate names and contact fields without account controls', () => {
  const values = { firstName: 'Mechanic', lastName: 'A', email: 'mechanic@example.invalid', phone: '09171234567' }
  assert.deepEqual(validateForm('mechanicCreate', values), {})
  assert.equal(validateForm('mechanicCreate', { ...values, phone: '' }).phone, 'Philippine mobile number is required.')
  assert.equal(validateForm('mechanicCreate', { ...values, phone: '0917123456' }).phone, 'Enter a valid Philippine mobile number.')
  assert.equal(validateForm('mechanicCreate', { ...values, phone: '0917abc4567' }).phone, 'Enter a valid Philippine mobile number.')
  assert.ok(validateForm('mechanicCreate', { ...values, firstName: '' }).firstName)
  assert.ok(validateForm('mechanicCreate', { ...values, lastName: '' }).lastName)
  assert.equal(Object.hasOwn(values, 'password'), false)
  assert.equal(Object.hasOwn(values, 'employeeId'), false)
  assert.ok(validateForm('mechanicCreate', { ...values, email: 'bad' }).email)
})
test('walk-in client uses registration names/mobile without password or consent fields', () => {
  const values = { firstName: 'Juan', lastName: 'Santos', email: 'juan@example.invalid', phone: '09171234567', middleName: '', suffix: '' }
  assert.deepEqual(validateForm('walkInClient', values), {})
  assert.ok(validateForm('walkInClient', { ...values, firstName: ' ' }).firstName)
  assert.ok(validateForm('walkInClient', { ...values, phone: '091712345678' }).phone)
  assert.equal(restrictMobileInput('+63 917 123 4567 extra 999'), '+639171234567')
})
