import { useState } from 'react'
import { Box, Button, LinearProgress, Paper, Stack, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import { Calendar, CheckCircle, Clock, Group, Industry, NavArrowRight, TaskList, Tools, User, Wrench } from 'iconoir-react'
import { Panel } from './DashboardParts'
import StatusChip from './StatusChip'
import { DetailDialog } from './RecordDetails'
import BookingRecordDetails from './BookingRecordDetails'
import { manilaToday, vehicleName } from '../pages/dashboardData'
import { dateLabel } from '../pages/bookingDisplay'
import '../adminDashboard.css'

const activeStatuses = ['pending', 'confirmed', 'checked_in', 'mechanic_assigned', 'in_service', 'final_inspection', 'ready_for_release']
const muted = { fontSize: 12, color: 'text.secondary' }
const panelStyle = { p: { xs: 2, md: 2.5 }, borderRadius: '16px' }

function SummaryCards({ items, columns, group }) {
  return <Box className={`admin-dashboard-kpis admin-dashboard-kpis--${group}`} sx={{ '--kpi-columns': columns }}>
    {items.map(({ label, value, detail, icon: Icon, tone, to }) => <Paper component={Link} to={to} variant="outlined" className="admin-dashboard-kpi" key={label}>
      <Box className={`admin-dashboard-kpi-icon admin-dashboard-kpi-icon--${tone}`} aria-hidden="true"><Icon width={23} height={23} strokeWidth={1.6} /></Box>
      <Box sx={{ minWidth: 0 }}><Typography className="admin-dashboard-kpi-value">{value}</Typography>
        <Typography className="admin-dashboard-kpi-label">{label}</Typography>
        <Typography className="admin-dashboard-kpi-detail">{detail}</Typography></Box>
    </Paper>)}
  </Box>
}

function Capacity({ label, icon: Icon, detail, percent, to }) {
  return <Box component={Link} to={to} className="admin-dashboard-capacity" aria-label={`${label}: ${detail}. View ${label.toLowerCase()}`}>
    <Box className="admin-dashboard-capacity-icon" aria-hidden="true"><Icon width={22} height={22} strokeWidth={1.6} /></Box>
    <Box className="admin-dashboard-capacity-content">
      <Box className="admin-dashboard-capacity-heading"><Typography sx={{ fontSize: 14, fontWeight: 600 }}>{label}</Typography><NavArrowRight className="admin-dashboard-capacity-arrow" width={18} height={18} strokeWidth={1.6} aria-hidden="true" /></Box>
      <Typography className="admin-dashboard-capacity-detail">{detail}</Typography>
      {percent !== undefined && <Box className="admin-dashboard-capacity-progress-row">
        <LinearProgress variant="determinate" value={percent} aria-label={`${label}: ${percent}% available capacity`} sx={{ flex: 1, height: 6, borderRadius: 4, bgcolor: 'var(--surface-soft)', '& .MuiLinearProgress-bar': { borderRadius: 4, bgcolor: 'var(--capacity-fill)' } }} />
        <Typography className="admin-dashboard-capacity-percent">{percent}%</Typography>
      </Box>}
    </Box>
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
    <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1.5 }}><Typography sx={muted}>Last 7 days</Typography><Typography className="admin-dashboard-trend-change">{change > 0 ? '↗ Increasing' : change < 0 ? '↘ Decreasing' : '→ Steady'} · latest 3 vs prior 3 days</Typography></Stack>
    <Box component="svg" viewBox="0 0 420 150" role="img" aria-label={`Daily bookings for the last seven days: ${days.map(day => `${day.date}: ${day.value}`).join(', ')}`} sx={{ display: 'block', width: '100%', height: { xs: 145, md: 170 } }}>
      {[36, 82, 128].map(y => <line key={y} x1="16" y1={y} x2="410" y2={y} stroke="var(--chart-grid)" strokeWidth="1" />)}
      {days.map((day, index) => {
        const x = 21 + index * 56
        const height = day.value / max * 100
        const latest = index === days.length - 1
        return <g key={day.date}><title>{day.date}: {day.value} bookings</title><rect x={x} y={128 - height} width="34" height={height} rx="5" fill={latest ? 'var(--toyota-red)' : 'var(--chart-bar)'} />
          <text x={x + 17} y={Math.max(21, 118 - height)} textAnchor="middle" fill="var(--ink)" fontSize="11">{day.value}</text>
          <text x={x + 17} y="146" textAnchor="middle" fill="var(--muted)" fontSize="10">{day.label}</text></g>
      })}
    </Box>
  </>
}

export default function AdminDashboardOverview({ data }) {
  const [selected, setSelected] = useState(null)
  const [bookings, mechanics, bays, staff, report] = data
  const queue = bookings.filter(item => activeStatuses.includes(item.status)).sort((a, b) => {
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
  return <Stack className="admin-dashboard" spacing={{ xs: 2, md: 2.25 }} sx={{ minWidth: 0 }}>
    <SummaryCards group="primary" columns={4} items={[
      { label: "Today's Bookings", value: bookings.length, detail: 'Scheduled today', icon: Calendar, tone: 'red', to: '/admin/bookings' },
      { label: 'Pending', value: bookings.filter(item => item.status === 'pending').length, detail: 'Awaiting confirmation', icon: Clock, tone: 'amber', to: '/admin/bookings' },
      { label: 'In Service', value: bookings.filter(item => item.status === 'in_service').length, detail: 'Being serviced today', icon: Tools, tone: 'blue', to: '/admin/job-orders' },
      { label: 'Completed', value: bookings.filter(item => item.status === 'completed').length, detail: 'Scheduled today', icon: CheckCircle, tone: 'green', to: '/admin/service-history' },
    ]} />
    <SummaryCards group="secondary" columns={3} items={[
      { label: 'Active Staff', value: activeStaff, detail: 'Active accounts', icon: Group, tone: 'neutral', to: '/admin/staff' },
      { label: 'Active Mechanics', value: activeMechanics.length, detail: 'Service team accounts', icon: Wrench, tone: 'neutral', to: '/admin/mechanics' },
      { label: 'Available Service Bays', value: `${availableBays} / ${currentBays.length}`, detail: 'Ready for service', icon: Industry, tone: 'neutral', to: '/admin/service-bays' },
    ]} />
    <Panel title={<span>Current Queue <span className="admin-dashboard-queue-count">· {queue.length}</span></span>} to="/admin/bookings" action="View all" sx={panelStyle} className="admin-dashboard-panel admin-dashboard-queue">
      {!queue.length ? <Typography sx={{ ...muted, py: 1 }}>No current bookings today.</Typography> : queue.slice(0, 3).map(item => <Box key={item._id} className="admin-dashboard-queue-row">
        <Box className="admin-dashboard-queue-vehicle"><Typography sx={{ fontSize: 14, fontWeight: 600 }}>{vehicleName(item.vehicle)}</Typography><Typography sx={muted}>{item.vehicle?.plateNumber || 'Plate unavailable'}</Typography></Box>
        <Box className="admin-dashboard-queue-date"><Calendar width={17} height={17} strokeWidth={1.6} aria-hidden="true" /><span>{dateLabel(item.bookingDate)}<br /><span>{item.bookingTime}</span></span></Box>
        <Box className="admin-dashboard-queue-service"><TaskList width={17} height={17} strokeWidth={1.6} aria-hidden="true" /><span>{item.services?.map(service => service?.name).filter(Boolean).join(', ') || 'Service unavailable'}</span></Box>
        <Box className="admin-dashboard-queue-client"><User width={17} height={17} strokeWidth={1.6} aria-hidden="true" /><span>{item.client?.fullName || 'Customer unavailable'}</span></Box>
        <Stack direction="row" gap={1} alignItems="center" justifyContent="flex-end"><StatusChip status={item.status} minimal /><Button size="small" onClick={() => setSelected(item)} aria-label={`Details for ${item.vehicle?.plateNumber || vehicleName(item.vehicle)}`} sx={{ minHeight: 34, minWidth: 34, px: 1 }}>Details</Button></Stack>
      </Box>)}
    </Panel>
    <Box className="admin-dashboard-lower-grid">
      <Panel title="Operations Overview" sx={panelStyle} className="admin-dashboard-panel"><Stack className="admin-dashboard-operations" spacing={0}>
        <Capacity label="Mechanics" icon={Tools} detail={`${activeMechanics.length} active · ${availableMechanics} available · ${busyMechanics} busy${offDutyMechanics ? ` · ${offDutyMechanics} off duty` : ''}`} percent={activeMechanics.length ? Math.round(availableMechanics / activeMechanics.length * 100) : 0} to="/admin/mechanics" />
        <Capacity label="Service Bays" icon={Industry} detail={`${currentBays.length} total · ${availableBays} available · ${occupiedBays} occupied${unavailableBays ? ` · ${unavailableBays} unavailable` : ''}`} percent={currentBays.length ? Math.round(availableBays / currentBays.length * 100) : 0} to="/admin/service-bays" />
        <Capacity label="Staff" icon={Group} detail={`${activeStaff} active accounts`} to="/admin/staff" />
      </Stack></Panel>
      <Panel title="Booking Trends" to="/admin/reports" action="View reports" sx={panelStyle} className="admin-dashboard-panel"><BookingTrend report={report} /></Panel>
    </Box>
    <DetailDialog open={Boolean(selected)} onClose={() => setSelected(null)} title="Booking details" reference={selected?._id} status={selected && <StatusChip status={selected.status} minimal />}>
      {selected && <BookingRecordDetails booking={selected} business />}
    </DetailDialog>
  </Stack>
}
