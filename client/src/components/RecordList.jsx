import { useState } from 'react'
import { Box, Paper, Typography } from '@mui/material'
import ListPagination from './ListPagination'
import { DEFAULT_LIST_LIMIT, listSelection } from '../utils/listPagination'
import { workspaceCardWidth } from '../layouts/workspaceDimensions'
import { recordPanelSx } from '../utils/recordStyles'
import EntityAvatar from './EntityAvatar'

export function RecordCard({ children, avatar, avatarSize = 48, entityName, entityType = 'vehicle', className = '', sx, ...props }) {
  return <Box className={`record-card ${className}`} {...props} sx={[{
    ...workspaceCardWidth, minHeight: 108, height: { xs: 'auto', sm: 108 }, p: 2.5,
    border: '1px solid var(--line)', borderRadius: '16px', bgcolor: 'var(--surface)',
    display: 'grid', gridTemplateColumns: { xs: `${avatarSize}px minmax(0, 1fr)`, sm: `${avatarSize}px minmax(0, 1fr) auto` },
    alignItems: 'center', columnGap: 2, rowGap: 2,
    '& .MuiTypography-root': { minWidth: 0, maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.5, my: 0 },
    '& > .record-card-copy': { minWidth: 0, maxHeight: 72, overflow: 'hidden' },
    '& .record-card-copy > .MuiTypography-root': { fontSize: 12, color: 'text.secondary' },
    '& .record-card-copy > .MuiTypography-root:first-child': { fontSize: 15, fontWeight: 650, color: 'text.primary' },
    '& .record-card-copy > .MuiTypography-root:nth-child(n+3)': { fontSize: 11 },
    '@container (max-width: 720px)': { height: 'auto', gridTemplateColumns: `${avatarSize}px minmax(0, 1fr)` },
  }, ...(Array.isArray(sx) ? sx : [sx])]}><EntityAvatar name={entityName} type={entityType} size={avatarSize}>{avatar}</EntityAvatar>{children}</Box>
}

export function RecordActions({ statuses, children }) {
  return <Box className="record-card-controls" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 2, minWidth: 0, maxWidth: '100%', pl: { xs: 0, sm: 2.5 }, pt: { xs: 1.5, sm: 0 },
    borderLeft: { xs: 'none', sm: '1px solid var(--line)' }, borderTop: { xs: '1px solid var(--line)', sm: 'none' },
    gridColumn: { xs: '1 / -1', sm: 'auto' },
    '@container (max-width: 720px)': { gridColumn: '1 / -1', pl: 0, pt: 1.5, borderLeft: 'none', borderTop: '1px solid var(--line)', width: '100%' },
    '@container (max-width: 420px)': { flexDirection: 'column', alignItems: 'stretch', gap: 1.5 },
  }}>
    {statuses && <Box className="record-card-statuses" sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, minWidth: 0,
      '& .MuiChip-root': { maxWidth: 190 },
    }}>{statuses}</Box>}
    {children && <Box className="record-card-actions" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'nowrap', gap: 1, flexShrink: 0, minWidth: 0,
      '& .MuiButton-root': { minHeight: 36, height: 36, px: 1.5, py: .5, borderRadius: '8px', fontSize: 12, whiteSpace: 'nowrap' },
      '@container (max-width: 420px)': { justifyContent: 'flex-start' },
    }}>{children}</Box>}
  </Box>
}

// Existing server paging is retained; unpaged endpoints use presentation-only paging.
export default function RecordList({ items, pagination, loading, empty = 'No records to show.', selectionKey = '', className = '', children }) {
  const [selection, setSelection] = useState({ key: selectionKey, page: 1, limit: DEFAULT_LIST_LIMIT })
  const current = listSelection(selection, selectionKey)
  const totalPages = Math.ceil(items.length / current.limit)
  const page = Math.min(current.page, Math.max(1, totalPages))
  const normalized = page === current.page ? current : { ...current, page }
  if (normalized !== selection) setSelection(normalized)
  const local = { page, limit: current.limit, totalItems: items.length, totalPages, busy: Boolean(loading),
    onPageChange: value => setSelection({ ...normalized, page: value }),
    onLimitChange: value => setSelection({ ...normalized, page: 1, limit: value }) }
  const visible = pagination ? items : items.slice((page - 1) * current.limit, page * current.limit)
  return <Box className={`record-list${className ? ` ${className}` : ''}`} sx={{ ...workspaceCardWidth, containerType: 'inline-size' }}>
    {loading || (!items.length ? typeof empty === 'string' ? <Typography className="portal-empty">{empty}</Typography> : empty
      : <Box className="record-list-rows" sx={{ display: 'grid', gap: 1.25, minWidth: 0 }}>{visible.map(children)}</Box>)}
    <ListPagination pagination={pagination || local} />
  </Box>
}

export function RecordPanel({ children, ...props }) {
  return <Paper variant="outlined" {...props} sx={recordPanelSx}>{children}</Paper>
}
