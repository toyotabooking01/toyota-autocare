import { useId, useState } from 'react'
import { Button, IconButton, Menu, MenuItem, Tooltip } from '@mui/material'
import MoreHorizRounded from '@mui/icons-material/MoreHorizRounded'
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'

const compactAction = { height: 36, minHeight: 36, px: 1.5, py: .5, fontSize: 12, borderRadius: '8px', whiteSpace: 'nowrap', flexShrink: 0 }

export function CompactActionButton({ sx, variant = 'outlined', children, ...props }) {
  return <Button size="small" variant={variant} {...props} sx={[compactAction, ...(Array.isArray(sx) ? sx : [sx])]}>{children}</Button>
}

export function DetailsButton(props) {
  return <CompactActionButton endIcon={<ChevronRightRounded sx={{ fontSize: 17 }} />} {...props}>Details</CompactActionButton>
}

export function MoreActionsMenu({ items, label, disabled = false }) {
  const [anchor, setAnchor] = useState(null)
  const id = useId()
  const available = items.filter(Boolean)
  if (!available.length) return null
  const close = () => setAnchor(null)
  return <>
    <Tooltip title="More actions"><span>
      <IconButton className="row-more-actions" aria-label={`More actions for ${label}`} aria-haspopup="menu"
        aria-expanded={anchor ? 'true' : undefined} aria-controls={anchor ? id : undefined} disabled={disabled}
        onClick={event => { event.stopPropagation(); setAnchor(event.currentTarget) }}
        sx={{ width: 36, height: 36, borderRadius: '8px', color: 'text.secondary', border: '1px solid var(--line)' }}>
        <MoreHorizRounded fontSize="small" />
      </IconButton>
    </span></Tooltip>
    <Menu id={id} anchorEl={anchor} open={Boolean(anchor)} onClose={close}
      slotProps={{ list: { 'aria-label': `Actions for ${label}` }, paper: { sx: { minWidth: 160, border: '1px solid var(--line)', borderRadius: '10px', boxShadow: '0 8px 24px #0002' } } }}>
      {available.map(item => <MenuItem key={item.label} disabled={disabled || item.disabled}
        onClick={event => { event.stopPropagation(); close(); item.onClick() }}
        sx={{ fontSize: 13, minHeight: 38, color: item.destructive ? 'error.main' : 'text.primary' }}>{item.label}</MenuItem>)}
    </Menu>
  </>
}
