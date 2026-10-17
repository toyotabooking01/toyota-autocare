import { Box, PaginationItem } from '@mui/material'
import { NavArrowLeft, NavArrowRight } from 'iconoir-react'
import { visiblePageItems } from '../utils/listPagination'

const PreviousLabel = () => <NavArrowLeft width={16} height={16} strokeWidth={1.8} />
const NextLabel = () => <NavArrowRight width={16} height={16} strokeWidth={1.8} />

export default function ListPagination({ pagination }) {
  if (!pagination) return null
  const { page, totalItems, totalPages, busy, onPageChange } = pagination
  if (!totalItems || totalPages < 1) return null
  const disabled = busy || !totalItems

  return <Box component="nav" aria-label="List pagination"
    className="list-pagination">
    <Box className="list-pagination-pages" role="group" aria-label="Pages">
      <PaginationItem type="previous" shape="rounded" aria-label="Go to previous page"
        slots={{ previous: PreviousLabel }} disabled={disabled || page <= 1}
        onClick={() => onPageChange(page - 1)} />
      {visiblePageItems(page, totalPages).map(item => typeof item === 'number'
        ? <PaginationItem key={item} type="page" page={item} shape="rounded"
          aria-label={`Go to page ${item}`} aria-current={item === page ? 'page' : undefined}
          selected={item === page} disabled={disabled} onClick={() => onPageChange(item)} />
        : <span key={item} className="list-pagination-ellipsis" aria-hidden="true">...</span>)}
      <PaginationItem type="next" shape="rounded" aria-label="Go to next page"
        slots={{ next: NextLabel }} disabled={disabled || page >= Math.max(1, totalPages)}
        onClick={() => onPageChange(page + 1)} />
    </Box>
  </Box>
}
