import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined'
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutlined'
import RadioButtonChecked from '@mui/icons-material/RadioButtonChecked'
import HighlightOff from '@mui/icons-material/HighlightOff'
import BlockOutlined from '@mui/icons-material/BlockOutlined'
import PersonOffOutlined from '@mui/icons-material/PersonOffOutlined'

const progress = { color: '#375b83', background: '#eef4fa', icon: RadioButtonChecked }
// Backend status keys are the shared contract; labels remain visible at all sizes.
export const statusStyles = {
  pending: { label: 'Pending', color: '#716043', background: '#f7f3e9', icon: ScheduleOutlined },
  confirmed: { ...progress, label: 'Confirmed' },
  checked_in: { ...progress, label: 'Checked-In', color: '#665682', background: '#f3f0f8' },
  mechanic_assigned: { ...progress, label: 'Mechanic Assigned' },
  in_service: { ...progress, label: 'In Service', color: '#88602c', background: '#fbf2e7' },
  final_inspection: { ...progress, label: 'Final Inspection', color: '#32736f', background: '#edf7f5' },
  ready_for_release: { ...progress, label: 'Ready for Release', color: '#397158', background: '#edf7f0' },
  completed: { label: 'Completed', color: '#237342', background: '#eaf6ed', icon: CheckCircleOutline },
  cancelled: { label: 'Cancelled', color: '#735867', background: '#f5eff2', icon: HighlightOff },
  rejected: { label: 'Rejected', color: '#a13f48', background: '#fbeff0', icon: BlockOutlined },
  no_show: { label: 'No Show', color: '#596473', background: '#eef0f3', icon: PersonOffOutlined },
}
