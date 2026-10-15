import { Chip } from '@mui/material'
import RadioButtonChecked from '@mui/icons-material/RadioButtonChecked'
import { statusStyles } from '../app/statuses'

export function StatusBadge({ label, icon, variant = 'filled', color = 'default', sx }) {
  const text = typeof label === 'string' ? label.charAt(0).toUpperCase() + label.slice(1) : label
  const active = ['active', 'current'].includes(String(label).toLowerCase())
  return <Chip className="status-badge" component="span" size="small" icon={icon} label={text} variant={variant} color={color}
    sx={[{ height: 28, minHeight: 28, maxWidth: '100%', fontSize: 12, fontWeight: 600, borderRadius: '999px', cursor: 'default',
      ...(color === 'default' ? { bgcolor: active ? 'var(--green-soft)' : variant === 'outlined' ? 'transparent' : 'var(--surface-soft)',
        color: active ? 'var(--green-ink)' : 'text.secondary' } : {}), borderColor: 'var(--line)',
      '& .MuiChip-icon': { color: 'inherit', fontSize: 14 },
      '& .MuiChip-label': { px: 1.25, py: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.4 },
    }, ...(Array.isArray(sx) ? sx : [sx])]} />
}

export default function StatusChip({ status }) {
  const style = statusStyles[status] || { label: 'Unknown status', color: 'var(--muted)', background: 'var(--surface-soft)', icon: RadioButtonChecked }
  const Icon = style.icon
  return <StatusBadge icon={<Icon />} label={style.label} sx={{ color: style.color, bgcolor: style.background }} />
}
