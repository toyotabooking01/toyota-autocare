export function listSelection(selection, key) {
  return selection.key === key ? selection : { key, page: 1, limit: selection.limit }
}
export function recordRange(page, limit, totalItems) {
  return totalItems ? `${(page - 1) * limit + 1}–${Math.min(page * limit, totalItems)} of ${totalItems}` : '0 of 0'
}

export function visiblePageItems(page, totalPages) {
  const last = Math.max(1, totalPages)
  if (last <= 5) return Array.from({ length: last }, (_, index) => index + 1)

  const middle = page <= 2 ? [1, 2, 3]
    : page >= last - 1 ? [last - 2, last - 1, last]
      : [page - 1, page, page + 1]
  const pages = [...new Set([1, ...middle, last])].sort((a, b) => a - b)

  return pages.flatMap((number, index) =>
    index && number - pages[index - 1] > 1
      ? [`ellipsis-${index}`, number]
      : [number])
}
export const DEFAULT_LIST_LIMIT = 5
export const LIST_PAGE_SIZES = [5, 10, 25, 50]
