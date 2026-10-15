import { Box } from '@mui/material'
import DirectionsCarOutlined from '@mui/icons-material/DirectionsCarOutlined'
import BuildOutlined from '@mui/icons-material/BuildOutlined'
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined'
import GarageOutlined from '@mui/icons-material/GarageOutlined'
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined'
import NotificationsNoneRounded from '@mui/icons-material/NotificationsNoneRounded'
import PeopleOutlineRounded from '@mui/icons-material/PeopleOutlineRounded'
import { userInitials } from '../utils/userInitials'

const icons = { vehicle: DirectionsCarOutlined, service: BuildOutlined, schedule: CalendarMonthOutlined,
  bay: GarageOutlined, transaction: ReceiptLongOutlined, notification: NotificationsNoneRounded, account: PeopleOutlineRounded }

export default function EntityAvatar({ name, type = 'vehicle', size = 48, children }) {
  const Icon = icons[type] || DirectionsCarOutlined
  return <Box className="record-entity-avatar" aria-hidden="true" sx={{ width: size, height: size, flexShrink: 0,
    display: 'grid', placeItems: 'center', overflow: 'hidden', borderRadius: '12px',
    border: '1px solid var(--line)', bgcolor: 'var(--surface-soft)', color: 'text.secondary', fontSize: 14, fontWeight: 700,
    '& img': { width: '100%', height: '100%', objectFit: 'contain' }, '& svg': { fontSize: 23 },
  }}>{children || (name ? userInitials(name) : <Icon />)}</Box>
}
