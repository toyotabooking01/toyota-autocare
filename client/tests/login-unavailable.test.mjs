import { test } from 'node:test'
import assert from 'node:assert/strict'
import { friendlyError } from '../src/utils/friendlyErrors.js'

test('login exposes only the known safe authentication-unavailable message for 503', () => {
  const message = 'Authentication is temporarily unavailable.'
  assert.equal(friendlyError({ response: { status: 503, data: { message } } }), message)
  for (const value of ['private configuration detail', 'MongoServerError secret', '<html>private</html>']) {
    assert.equal(friendlyError({ response: { status: 503, data: { message: value } } }),
      'We could not complete that request. Please try again.')
  }
})
