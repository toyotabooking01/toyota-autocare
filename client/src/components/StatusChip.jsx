import { Chip } from '@mui/material'
import RadioButtonChecked from '@mui/icons-material/RadioButtonChecked'
import { Activity, CheckCircle, Clock, Prohibition, Tools, UserXmark, XmarkCircle } from 'iconoir-react'
import { statusStyles } from '../app/statuses'

const outlineStatusIcons = {
  awaiting_downpayment: Clock,
  pending: Clock,
  confirmed: Activity,
  checked_in: Activity,
  mechanic_assigned: Tools,
  in_service: Tools,
  final_inspection: CheckCircle,
  ready_for_release: CheckCircle,
  completed: CheckCircle,
  cancelled: XmarkCircle,
  rejected: Prohibition,
  no_show: UserXmark,
}

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

export function MinimalStatus({ label, status = 'unknown' }) {
  return <span className="admin-status-minimal" data-status={status || 'unknown'}><span className="admin-status-minimal-dot" aria-hidden="true" /><span>{label}</span></span>
}

export default function StatusChip({ status, iconFamily = 'material', minimal = false }) {
  const style = statusStyles[status] || { label: 'Unknown status', color: 'var(--muted)', background: 'var(--surface-soft)', icon: RadioButtonChecked }
  if (minimal) return <MinimalStatus label={style.label} status={status} />
  const Icon = iconFamily === 'iconoir' ? outlineStatusIcons[status] || Activity : style.icon
  return <StatusBadge icon={iconFamily === 'iconoir' ? <Icon width={14} height={14} strokeWidth={1.6} /> : <Icon />} label={style.label} sx={{ color: style.color, bgcolor: style.background }} />
}
