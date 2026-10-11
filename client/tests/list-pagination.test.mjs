import { test } from 'node:test'
import assert from 'node:assert/strict'
import { listSelection, recordRange } from '../src/utils/listPagination.js'

test('filter changes reset page once and retain selected page size; navigation preserves filter key', () => {
  const selection = { key: 'active/search', page: 4, limit: 25 }
  assert.equal(listSelection(selection, 'active/search'), selection)
  const changed = listSelection(selection, 'archived/search')
  assert.deepEqual(changed, { key: 'archived/search', page: 1, limit: 25 })
  const next = { ...changed, page: 2 }
  assert.equal(listSelection(next, 'archived/search'), next)
  assert.equal(listSelection(next, 'active/search').page, 1)
})
test('ranges display complete, partial and empty pages', () => {
  assert.equal(recordRange(1, 10, 42), '1–10 of 42')
  assert.equal(recordRange(5, 10, 42), '41–42 of 42')
  assert.equal(recordRange(2, 25, 42), '26–42 of 42')
  assert.equal(recordRange(1, 50, 0), '0 of 0')
})
