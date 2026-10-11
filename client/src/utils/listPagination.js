export function listSelection(selection, key) {
  return selection.key === key ? selection : { key, page: 1, limit: selection.limit }
}
export function recordRange(page, limit, totalItems) {
  return totalItems ? `${(page - 1) * limit + 1}–${Math.min(page * limit, totalItems)} of ${totalItems}` : '0 of 0'
}
