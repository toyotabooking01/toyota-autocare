import { Chip } from '@mui/material'
import RadioButtonChecked from '@mui/icons-material/RadioButtonChecked'
import { statusStyles } from '../app/statuses'

export default function StatusChip({ status }) {
  const style = statusStyles[status] || { label: 'Unknown status', color: 'var(--muted)', background: 'var(--surface-soft)', icon: RadioButtonChecked }
  const Icon = style.icon
  return <Chip size="small" icon={<Icon />} label={style.label} sx={{
    minHeight: 27, height: 'auto', maxWidth: '100%', fontSize: 11, fontWeight: 600,
    color: style.color, bgcolor: style.background, borderRadius: 1.5,
    '& .MuiChip-icon': { color: 'inherit', fontSize: 14 },
    '& .MuiChip-label': { px: 1, py: .4, whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: 1.4 },
  }} />
}
