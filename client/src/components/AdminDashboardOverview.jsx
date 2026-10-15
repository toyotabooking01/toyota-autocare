import { useState } from 'react'
import { Box, Button, LinearProgress, Paper, Stack, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined'
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined'
import BuildOutlined from '@mui/icons-material/BuildOutlined'
import TaskAltOutlined from '@mui/icons-material/TaskAltOutlined'
import GroupsOutlined from '@mui/icons-material/GroupsOutlined'
import GarageOutlined from '@mui/icons-material/GarageOutlined'
import { Panel } from './DashboardParts'
import StatusChip from './StatusChip'
import { DetailDialog } from './RecordDetails'
import BookingRecordDetails from './BookingRecordDetails'
import { manilaToday, vehicleName } from '../pages/dashboardData'
import { dateLabel } from '../pages/bookingDisplay'

const activeStatuses = ['pending', 'confirmed', 'checked_in', 'mechanic_assigned', 'in_service', 'final_inspection', 'ready_for_release']
const muted = { fontSize: 11, color: 'text.secondary' }
const panelStyle = { p: 2, minWidth: 0, '& > .MuiStack-root:first-of-type': { mb: 1 } }

function SummaryCards({ items, columns }) {
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: `repeat(${columns}, minmax(0, 1fr))` }, gap: 1.5 }}>
    {items.map(({ label, value, detail, icon: Icon }) => <Paper variant="outlined" key={label} sx={{ p: 1.75, minWidth: 0, borderColor: 'var(--line)', borderRadius: '14px' }}>
      <Stack direction="row" alignItems="center" spacing={1}><Icon sx={{ fontSize: 18, color: 'text.secondary' }} /><Typography sx={{ fontSize: 12, fontWeight: 600 }}>{label}</Typography></Stack>
      <Typography sx={{ fontSize: 26, lineHeight: 1.2, fontWeight: 700, mt: .75 }}>{value}</Typography>
      <Typography sx={{ ...muted, mt: .4 }}>{detail}</Typography>
    </Paper>)}
  </Box>
}

function Capacity({ label, metrics, available, total, to, action }) {
  return <Box sx={{ minWidth: 0 }}>
    <Stack direction="row" justifyContent="space-between" alignItems="center"><Typography sx={{ fontSize: 12, fontWeight: 650 }}>{label}</Typography><Button component={Link} to={to} size="small" sx={{ fontSize: 11, minHeight: 28, p: .5 }}>{action}</Button></Stack>
    <Stack direction="row" flexWrap="wrap" gap={2} sx={{ mt: .5, mb: 1 }}>{metrics.map(([value, name]) => <Typography key={name} sx={muted}><Box component="strong" sx={{ fontSize: 15, color: 'text.primary', mr: .5 }}>{value}</Box>{name}</Typography>)}</Stack>
    <LinearProgress variant="determinate" value={total ? available / total * 100 : 0} aria-label={`${label} available capacity`} sx={{ height: 4, borderRadius: 2, bgcolor: 'var(--surface-soft)' }} />
  </Box>
}

function BookingTrend({ report }) {
  const today = manilaToday()
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${today}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() - 6 + index)
    const key = date.toISOString().slice(0, 10)
    return { date: key, label: new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' }).format(date), value: report.bookingsByDate?.find(day => day.date === key)?.bookings || 0 }
  })
  const max = Math.max(1, ...days.map(day => day.value))
  const change = days.slice(4).reduce((sum, day) => sum + day.value, 0) - days.slice(1, 4).reduce((sum, day) => sum + day.value, 0)
  return <>
    <Stack direction="row" justifyContent="space-between" gap={1}><Typography sx={muted}>Last 7 days</Typography><Typography sx={muted}>{change > 0 ? 'Increasing' : change < 0 ? 'Decreasing' : 'Steady'} · latest 3 vs prior 3 days</Typography></Stack>
    <Box component="svg" viewBox="0 0 420 130" role="img" aria-label={`Daily bookings for the last seven days: ${days.map(day => `${day.date}: ${day.value}`).join(', ')}`} sx={{ display: 'block', width: '100%', height: 130, mt: 1 }}>
      <line x1="8" y1="104" x2="412" y2="104" stroke="var(--line)" />
      {days.map((day, index) => {
        const x = 14 + index * 59
        const height = day.value / max * 75
        return <g key={day.date}><title>{day.date}: {day.value} bookings</title><rect x={x} y={104 - height} width="32" height={height} rx="4" fill="currentColor" opacity={index === 6 ? '.85' : '.4'} /><text x={x + 16} y={Math.max(14, 96 - height)} textAnchor="middle" fill="currentColor" fontSize="11">{day.value}</text><text x={x + 16} y="124" textAnchor="middle" fill="currentColor" fontSize="10">{day.label}</text></g>
      })}
    </Box>
  </>
}

export default function AdminDashboardOverview({ data }) {
  const [selected, setSelected] = useState(null)
  const [bookings, mechanics, bays, staff, report] = data
  const queue = bookings.filter(item => activeStatuses.includes(item.status)).sort((a, b) => {
    // Surface visits already on site first, then the earliest scheduled arrivals.
    const onSite = item => !['pending', 'confirmed'].includes(item.status)
    return Number(onSite(b)) - Number(onSite(a)) || a.bookingTime.localeCompare(b.bookingTime)
  })
  const activeMechanics = mechanics.filter(item => !item.isArchived && item.status === 'active')
  const currentBays = bays.filter(item => !item.isArchived)
  const activeStaff = staff.filter(item => !item.isArchived && item.status === 'active').length
  const availableMechanics = activeMechanics.filter(item => item.availability === 'available').length
  const busyMechanics = activeMechanics.filter(item => item.availability === 'busy').length
  const offDutyMechanics = activeMechanics.filter(item => item.availability === 'off_duty').length
  const availableBays = currentBays.filter(item => item.operationalStatus === 'operational' && item.availability === 'available').length
  const occupiedBays = currentBays.filter(item => item.operationalStatus === 'operational' && item.availability === 'occupied').length
  const unavailableBays = currentBays.filter(item => item.operationalStatus !== 'operational').length
  return <Stack spacing={1.5} sx={{ minWidth: 0 }}>
    <SummaryCards columns={4} items={[
      { label: "Today's Bookings", value: bookings.length, detail: 'Scheduled today', icon: CalendarMonthOutlined },
      { label: 'Pending', value: bookings.filter(item => item.status === 'pending').length, detail: 'Awaiting confirmation', icon: ScheduleOutlined },
      { label: 'In Service', value: bookings.filter(item => item.status === 'in_service').length, detail: 'Being serviced today', icon: BuildOutlined },
      { label: 'Completed', value: bookings.filter(item => item.status === 'completed').length, detail: 'Scheduled today', icon: TaskAltOutlined },
    ]} />
    <SummaryCards columns={3} items={[
      { label: 'Active Staff', value: activeStaff, detail: 'Active accounts', icon: GroupsOutlined },
      { label: 'Active Mechanics', value: activeMechanics.length, detail: 'Service team accounts', icon: BuildOutlined },
      { label: 'Available Service Bays', value: `${availableBays} / ${currentBays.length}`, detail: 'Ready for service', icon: GarageOutlined },
    ]} />
    <Panel title={`Current Queue · ${queue.length}`} to="/admin/bookings" sx={panelStyle}>
      {!queue.length ? <Typography sx={{ ...muted, py: 1 }}>No current bookings today.</Typography> : queue.slice(0, 3).map(item => <Box key={item._id} sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1.2fr) minmax(0, .9fr) minmax(0, 1fr) minmax(0, .8fr) auto' }, gap: 1, alignItems: 'center', py: 1, borderTop: '1px solid var(--line)', '& > *': { minWidth: 0 } }}>
        <Box><Typography sx={{ fontSize: 12, fontWeight: 600 }}>{vehicleName(item.vehicle)}</Typography><Typography sx={muted}>{item.vehicle?.plateNumber || 'Plate unavailable'}</Typography></Box>
        <Typography sx={muted}>{dateLabel(item.bookingDate)} · {item.bookingTime}</Typography>
        <Typography sx={muted}>{item.services?.map(service => service?.name).filter(Boolean).join(', ') || 'Service unavailable'}</Typography>
        <Typography sx={muted}>{item.client?.fullName || 'Customer unavailable'}</Typography>
        <Stack direction="row" gap={1} alignItems="center"><StatusChip status={item.status} /><Button size="small" onClick={() => setSelected(item)} aria-label={`Details for ${item.vehicle?.plateNumber || vehicleName(item.vehicle)}`} sx={{ minHeight: 28, fontSize: 11 }}>Details ›</Button></Stack>
      </Box>)}
    </Panel>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5, alignItems: 'start' }}>
      <Panel title="Operations Overview" sx={panelStyle}><Stack spacing={1.25}>
        <Capacity label="Mechanics" metrics={[[activeMechanics.length, 'Active'], [availableMechanics, 'Available'], [busyMechanics, 'Busy'], ...(offDutyMechanics ? [[offDutyMechanics, 'Off duty']] : [])]} available={availableMechanics} total={activeMechanics.length} to="/admin/mechanics" action="View mechanics" />
        <Capacity label="Service Bays" metrics={[[currentBays.length, 'Total'], [availableBays, 'Available'], [occupiedBays, 'Occupied'], ...(unavailableBays ? [[unavailableBays, 'Unavailable']] : [])]} available={availableBays} total={currentBays.length} to="/admin/service-bays" action="View service bays" />
        <Stack direction="row" alignItems="center" justifyContent="space-between"><Typography sx={{ fontSize: 12 }}>Staff <Box component="strong" sx={{ ml: 1 }}>{activeStaff}</Box> Active</Typography><Button size="small" component={Link} to="/admin/staff" sx={{ fontSize: 11, minHeight: 28, p: .5 }}>View staff</Button></Stack>
      </Stack></Panel>
      <Panel title="Booking Trends" to="/admin/reports" action="View reports" sx={panelStyle}><BookingTrend report={report} /></Panel>
    </Box>
    <DetailDialog open={Boolean(selected)} onClose={() => setSelected(null)} title="Booking details" reference={selected?._id} status={selected && <StatusChip status={selected.status} />}>
      {selected && <BookingRecordDetails booking={selected} business />}
    </DetailDialog>
  </Stack>
}
