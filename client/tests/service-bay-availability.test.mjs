import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { scheduleBayNameCheck } from '../src/utils/serviceBayAvailability.js'
import { normalizeServiceBayName } from '../../shared/serviceBayName.mjs'

test('bay normalization treats case and surrounding whitespace identically', () => {
  for (const name of ['BAY 1', 'Bay 1', 'bay 1', ' BAY 1 ', '\tBay 1\n']) assert.equal(normalizeServiceBayName(name), 'BAY 1')
})
test('rapid typing debounces to one check with edit exclusion, and reports duplicates', async () => {
  const calls = [], results = []
  const request = async (path, options) => { calls.push({ path, ...options }); return { data: { exists: true } } }
  let cancel
  for (const name of ['B', 'BA', 'BAY 1']) {
    cancel?.()
    cancel = scheduleBayNameCheck(request, { name, excludeId: 'existing-id' }, status => results.push(status))
  }
  assert.equal(calls.length, 0)
  await delay(350)
  assert.equal(calls.length, 1); assert.equal(calls[0].path, '/service-bays/name-availability')
  assert.deepEqual(calls[0].params, { name: 'BAY 1', excludeId: 'existing-id' })
  assert.deepEqual(results, ['duplicate']); cancel()
})
test('stale in-flight responses cannot overwrite a corrected name, even if transport ignores abort', async () => {
  let resolveOld, oldSignal
  const results = []
  const cancelOld = scheduleBayNameCheck((_, { signal }) => {
    oldSignal = signal; return new Promise(resolve => { resolveOld = resolve })
  }, { name: 'BAY 1' }, status => results.push(status))
  await delay(350); cancelOld(); assert.equal(oldSignal.aborted, true)
  const cancelNew = scheduleBayNameCheck(async () => ({ data: { exists: false } }), { name: 'BAY 2' }, status => results.push(status))
  await delay(350); resolveOld({ data: { exists: true } }); await delay(0)
  assert.deepEqual(results, ['available']); cancelNew()
})
test('closing before debounce makes no request; network failure produces a friendly fallback state', async () => {
  let calls = 0; const results = []
  const request = async () => { calls++; throw new Error('private transport detail') }
  const cancel = scheduleBayNameCheck(request, { name: 'BAY 1' }, status => results.push(status))
  cancel(); await delay(350); assert.equal(calls, 0)
  const stop = scheduleBayNameCheck(request, { name: 'BAY 2' }, status => results.push(status))
  await delay(350); assert.deepEqual(results, ['unavailable']); stop()
})
