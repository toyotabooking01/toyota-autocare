import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_LIST_LIMIT, LIST_PAGE_SIZES, listSelection, recordRange, visiblePageItems } from '../src/utils/listPagination.js'

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
  assert.equal(DEFAULT_LIST_LIMIT, 5)
  assert.deepEqual(LIST_PAGE_SIZES, [5, 10, 25, 50])
  assert.equal(recordRange(2, DEFAULT_LIST_LIMIT, 6), '6–6 of 6')
  assert.equal(recordRange(1, 10, 42), '1–10 of 42')
  assert.equal(recordRange(5, 10, 42), '41–42 of 42')
  assert.equal(recordRange(2, 25, 42), '26–42 of 42')
  assert.equal(recordRange(1, 50, 0), '0 of 0')
})

test('page controls stay compact at the start, middle, and end', () => {
  assert.deepEqual(visiblePageItems(1, 7), [1, 2, 3, 'ellipsis-3', 7])
  assert.deepEqual(visiblePageItems(5, 10), [1, 'ellipsis-1', 4, 5, 6, 'ellipsis-4', 10])
  assert.deepEqual(visiblePageItems(9, 10), [1, 'ellipsis-1', 8, 9, 10])
  assert.deepEqual(visiblePageItems(3, 5), [1, 2, 3, 4, 5])
  assert.ok(visiblePageItems(50, 100).filter(item => typeof item === 'number').length <= 5)
})
