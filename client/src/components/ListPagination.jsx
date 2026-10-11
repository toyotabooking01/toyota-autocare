import { Box, MenuItem, Pagination, Stack, TextField, Typography } from '@mui/material'
import { recordRange } from '../utils/listPagination'

export default function ListPagination({ pagination }) {
  if (!pagination) return null
  const { page, limit, totalItems, totalPages, busy, onPageChange, onLimitChange } = pagination
  return <Stack component="nav" aria-label="List pagination" direction={{ xs: 'column', md: 'row' }}
    spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between" sx={{ pt: 2.5, minWidth: 0 }}>
    <Stack direction="row" spacing={2} alignItems="center" justifyContent={{ xs: 'space-between', md: 'flex-start' }}>
      <Typography sx={{ fontSize: 13 }} aria-live="polite">{recordRange(page, limit, totalItems)}</Typography>
      <TextField select label="Per page" size="small" value={limit} disabled={busy} sx={{ width: 100 }}
        onChange={event => onLimitChange(Number(event.target.value))}>
        {[10, 25, 50].map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}
      </TextField>
    </Stack>
    <Box sx={{ display: 'flex', justifyContent: 'center', minWidth: 0 }}>
      <Pagination count={Math.max(1, totalPages)} page={page} size="small" siblingCount={0} boundaryCount={1}
        disabled={busy || !totalItems} onChange={(_, value) => onPageChange(value)} sx={{ '& .MuiPagination-ul': { justifyContent: 'center', flexWrap: 'wrap' } }} />
    </Box>
  </Stack>
}
