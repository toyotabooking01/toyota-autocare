import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined'
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutlined'
import RadioButtonChecked from '@mui/icons-material/RadioButtonChecked'
import HighlightOff from '@mui/icons-material/HighlightOff'
import BlockOutlined from '@mui/icons-material/BlockOutlined'
import PersonOffOutlined from '@mui/icons-material/PersonOffOutlined'

const progress = { color: 'var(--blue-ink)', background: 'var(--blue-soft)', icon: RadioButtonChecked }
// Backend status keys are the shared contract; labels remain visible at all sizes.
export const statusStyles = {
  pending: { label: 'Pending', color: 'var(--amber-ink)', background: 'var(--amber-soft)', icon: ScheduleOutlined },
  confirmed: { ...progress, label: 'Confirmed' },
  checked_in: { ...progress, label: 'Checked-In', color: 'var(--purple-ink)', background: 'var(--purple-soft)' },
  mechanic_assigned: { ...progress, label: 'Mechanic Assigned' },
  in_service: { ...progress, label: 'In Service', color: 'var(--amber-ink)', background: 'var(--amber-soft)' },
  final_inspection: { ...progress, label: 'Final Inspection', color: 'var(--green-ink)', background: 'var(--green-soft)' },
  ready_for_release: { ...progress, label: 'Ready for Release', color: 'var(--green-ink)', background: 'var(--green-soft)' },
  completed: { label: 'Completed', color: 'var(--green-ink)', background: 'var(--green-soft)', icon: CheckCircleOutline },
  cancelled: { label: 'Cancelled', color: 'var(--muted)', background: 'var(--surface-soft)', icon: HighlightOff },
  rejected: { label: 'Rejected', color: 'var(--red-ink)', background: 'var(--accent-soft)', icon: BlockOutlined },
  no_show: { label: 'No Show', color: 'var(--muted)', background: 'var(--surface-soft)', icon: PersonOffOutlined },
}
