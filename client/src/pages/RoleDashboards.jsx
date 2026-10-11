import { useEffect, useState } from 'react'
import { Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded'
import GarageOutlined from '@mui/icons-material/GarageOutlined'
import api from '../services/api'
import { useAuth } from '../auth/AuthContext'
import { MetricCards, PageHeading, Panel } from '../components/DashboardParts'
import StatusChip from '../components/StatusChip'
import JobPreviewList from '../components/JobPreviewList'
import { dateLabel } from './bookingDisplay'
import { dateText, vehicleText } from './maintenanceDisplay'
import { bookingPreview, jobPreview, manilaToday, vehicleName } from './dashboardData'
import { mechanicAvailabilityLabel } from '../utils/mechanicAvailability'
import journey from '../assets/autocare-scenic.png'
import DirectionsCarOutlined from '@mui/icons-material/DirectionsCarOutlined'
import NotificationsNoneRounded from '@mui/icons-material/NotificationsNoneRounded'

const grid = { display: 'grid', gap: 2.5, alignItems: 'start' }
const small = { fontSize: 12, color: 'text.secondary' }
const strong = { fontSize: 14, fontWeight: 650 }
const activeStatuses = ['pending', 'confirmed', 'checked_in', 'mechanic_assigned', 'in_service', 'final_inspection', 'ready_for_release']
const progressed = ['checked_in', 'mechanic_assigned', 'in_service', 'final_inspection', 'ready_for_release']

function useDashboard(role) {
  const [state, setState] = useState({ data: null, loading: true, error: '' })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const paths = role === 'client' ? ['/bookings', '/vehicles', '/notifications', '/maintenance-reminders']
      : role === 'mechanic' ? ['/job-orders'] : [`/bookings?date=${manilaToday()}`, '/mechanics', '/service-bays']
    Promise.all(paths.map(path => api.get(path, { signal: controller.signal })))
      .then(responses => { if (!controller.signal.aborted) setState({ data: responses.map(response => response.data.items), loading: false, error: '' }) })
      .catch(() => { if (!controller.signal.aborted) setState({ data: null, loading: false, error: 'Dashboard data could not be loaded.' }) })
    return () => controller.abort()
  }, [role, revision])
  return { ...state, retry: () => { setState({ data: null, loading: true, error: '' }); setRevision(value => value + 1) } }
}
function DashboardState({ state }) {
  return state.loading ? <Stack alignItems="center" sx={{ py: 8 }} role="status"><CircularProgress size={28} /><Typography sx={{ ...small, mt: 1 }}>Loading dashboard…</Typography></Stack>
    : <Alert severity="error" action={<Button color="inherit" size="small" onClick={state.retry}>Retry</Button>}>{state.error}</Alert>
}

export function ClientDashboard() {
  const { user } = useAuth()
  const state = useDashboard('client')
  const heading = <PageHeading title={`Welcome back, ${user.fullName.split(' ')[0]}!`} subtitle="Keep your Toyota in top shape. Safe journeys start with proper care." preview={false} />
  if (!state.data) return <>{heading}<DashboardState state={state} /></>
  const [bookings, vehicles, notifications, reminders] = state.data
  const today = manilaToday()
  const live = bookings.filter(item => activeStatuses.includes(item.status))
  const inProgress = live.filter(item => progressed.includes(item.status)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  const upcoming = live.filter(item => item.bookingDate >= today).sort((a, b) => `${a.bookingDate}${a.bookingTime}`.localeCompare(`${b.bookingDate}${b.bookingTime}`))[0]
  const current = inProgress || upcoming
  const latest = bookings.filter(item => item.status === 'completed').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  const nextReminder = reminders.find(item => item.status === 'pending')
  const unread = notifications.filter(item => !item.isRead).length
  return <>{heading}
    <Box className="client-overview" sx={{ ...grid, gridTemplateColumns: theme => theme.palette.mode === 'dark' ? { xs: '1fr', md: '1fr 1fr', lg: '1.5fr 1fr 1fr' } : { xs: '1fr', md: '1fr 1fr' }, mb: 2.5 }}>
      <Paper className="dashboard-hero" variant="outlined" sx={{ position: 'relative', overflow: 'hidden', borderRadius: 3, minHeight: theme => theme.palette.mode === 'dark' ? 320 : 280, gridColumn: theme => theme.palette.mode === 'dark' ? { xs: '1 / -1', lg: 'auto' } : '1 / -1', color: '#fff' }}>
        <Box component="img" src={journey} alt="Silver Toyota on a scenic mountain road" sx={{ position: 'absolute', right: 0, bottom: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 62%' }} />
        <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, #07111ce6, #07111c40 60%, transparent)' }} />
        <Box sx={{ position: 'relative', p: { xs: 3, md: 4 } }}><Typography sx={{ fontSize: 10, letterSpacing: 2.5, mb: 2, color: '#f8cdd1' }}>BUILT FOR THE ROAD AHEAD</Typography><Typography component="h2" sx={{ fontSize: { xs: 28, md: 36 }, fontWeight: 750, lineHeight: 1.15, maxWidth: 340 }}>Reliable care<br />for every journey.</Typography>
          <Typography sx={{ fontSize: 13, color: '#e2e8ef', mt: 1, mb: 3 }}>Expert service. Genuine care.</Typography>
          <Button component={Link} to="/client/book-service" variant="contained" endIcon={<ArrowForwardRounded />}>Book a service</Button>
        </Box>
      </Paper>
      <Panel title="Current or upcoming service" to="/client/bookings" action="My bookings" sx={{ minHeight: theme => theme.palette.mode === 'dark' ? 320 : 205 }}>
        {current ? <><StatusChip status={current.status} /><Typography sx={{ ...strong, mt: 1.5 }}>{vehicleName(current.vehicle)}</Typography>
          <Typography sx={{ ...small, mt: .5 }}>{(current.services || []).map(item => item?.name).filter(Boolean).join(', ') || 'Service unavailable'}</Typography>
          <Typography sx={{ ...small, mt: 2 }}>Scheduled visit</Typography><Typography sx={strong}>{dateLabel(current.bookingDate)} · {current.bookingTime}</Typography></>
          : <Typography sx={small}>No current or upcoming booking.</Typography>}
      </Panel>
      <Panel title="Next maintenance" to="/client/reminders" action="View maintenance" sx={{ minHeight: theme => theme.palette.mode === 'dark' ? 320 : 205 }}>
        <Typography sx={{ fontSize: nextReminder ? 22 : 14, fontWeight: 700, color: nextReminder ? 'primary.main' : 'text.secondary' }}>{nextReminder ? dateText(nextReminder.nextRecommendedServiceDate) : 'No recommendation yet'}</Typography>
        <Typography sx={{ ...small, mt: 1, mb: 2 }}>{nextReminder ? `${vehicleText(nextReminder.vehicle)} · ${nextReminder.service?.name || 'Service'}` : 'Recommendations appear after completed services with a configured interval.'}</Typography>
        <Button component={Link} to="/client/book-service" variant="outlined" fullWidth>Plan a visit</Button>
      </Panel>
    </Box>
    <Box sx={{ ...grid, gridTemplateColumns: { xs: '1fr', md: '1.3fr 1fr' } }}>
      <Panel title={`My vehicles · ${vehicles.length}`} to="/client/vehicles">
        {!vehicles.length ? <Typography sx={small}>No vehicles added yet.</Typography> : <Stack spacing={1}>{vehicles.slice(0, 3).map(vehicle => <Box key={vehicle._id} component={Link} to="/client/vehicles" className="vehicle-preview">
          <Box className="vehicle-symbol"><DirectionsCarOutlined /></Box><Box sx={{ flex: 1 }}><Typography sx={strong}>{vehicle.make} {vehicle.model} {vehicle.year}</Typography><Typography sx={small}>{vehicle.plateNumber}</Typography></Box><ArrowForwardRounded sx={{ fontSize: 17 }} />
        </Box>)}</Stack>}
        <Typography sx={{ ...small, mt: 2 }}>Latest completed service: {latest ? `${(latest.services || []).map(item => item?.name).filter(Boolean).join(', ')} · ${dateLabel(latest.bookingDate)}` : 'None yet'}</Typography>
      </Panel>
      <Panel title={`Notifications${unread ? ` · ${unread} unread` : ''}`} to="/client/notifications"><Stack spacing={2}>{!notifications.length ? <Typography sx={small}>No notifications yet.</Typography> : notifications.slice(0, 3).map(item => <Stack direction="row" spacing={1.5} key={item._id} sx={{ pb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box className="notification-symbol"><NotificationsNoneRounded fontSize="small" /></Box><Box><Typography sx={{ fontSize: 13, fontWeight: item.isRead ? 550 : 700 }}>{item.title}</Typography><Typography sx={{ ...small, mt: .4 }}>{item.message}</Typography></Box>
      </Stack>)}</Stack></Panel>
    </Box>
  </>
}

export function MechanicDashboard() {
  const { user } = useAuth()
  const state = useDashboard('mechanic')
  const heading = <PageHeading title={`Welcome back, ${user.fullName.split(' ')[0]}!`} subtitle="Your assigned service work at a glance." preview={false} />
  if (!state.data) return <>{heading}<DashboardState state={state} /></>
  const jobs = state.data[0]
  const today = manilaToday()
  const active = jobs.find(item => ['pending', 'in_progress'].includes(item.status))
  const queued = jobs.filter(item => item.status === 'pending' && item.booking?.bookingDate >= today)
  const completedToday = jobs.filter(item => item.status === 'completed' && item.completedAt && manilaToday(new Date(item.completedAt)) === today)
  const assignedToday = jobs.filter(item => item.booking?.bookingDate === today)
  const metrics = [
    { label: 'Assigned today', value: assignedToday.length, detail: 'Scheduled visits', tone: 'blue' },
    { label: 'Active job', value: active ? 1 : 0, detail: 'Unfinished assignment', tone: 'amber' },
    { label: 'Completed today', value: completedToday.length, detail: 'Finished visits', tone: 'green' },
    { label: 'Queued', value: queued.length, detail: 'Awaiting service start', tone: 'purple' },
  ]
  return <>{heading}<MetricCards items={metrics} />
    <Box sx={{ ...grid, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.1fr) minmax(0, 1fr)' } }}>
      <Panel title="Active job" to="/mechanic/active-job" action="View workspace">
        {active ? <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}><Box><Typography sx={strong}>{vehicleName(active.booking?.vehicle)}</Typography>
          <Typography sx={{ ...small, mt: .6 }}>{(active.booking?.services || []).map(item => item?.name).filter(Boolean).join(', ')} · {active.serviceBay?.name || 'Bay unavailable'}</Typography></Box><StatusChip status={active.booking?.status} /></Stack>
          : <Typography sx={small}>No active job assigned.</Typography>}
      </Panel>
      <Panel title="Queued assignments" to="/mechanic/jobs"><JobPreviewList jobs={queued.slice(0, 5).map(jobPreview)} /></Panel>
    </Box>
  </>
}

export function AdminDashboard() {
  const state = useDashboard('admin')
  const heading = <PageHeading title="Admin dashboard" subtitle="Today's service operations and bookings at Toyota AutoCare." preview={false} />
  if (!state.data) return <>{heading}<DashboardState state={state} /></>
  const [bookings, mechanics, bays] = state.data
  const queue = bookings.filter(item => activeStatuses.includes(item.status)).sort((a, b) => a.bookingTime.localeCompare(b.bookingTime))
  const currentMechanics = mechanics.filter(item => !item.isArchived && item.status === 'active')
  const currentBays = bays.filter(item => !item.isArchived)
  const metrics = [
    { label: "Today's bookings", value: bookings.length, detail: `${bookings.filter(item => item.bookingType === 'online').length} online · ${bookings.filter(item => item.bookingType === 'walk-in').length} walk-ins`, tone: 'blue' },
    { label: 'Pending', value: bookings.filter(item => item.status === 'pending').length, detail: 'Awaiting confirmation', tone: 'amber' },
    { label: 'In service', value: bookings.filter(item => item.status === 'in_service').length, detail: 'Currently being serviced', tone: 'purple' },
    { label: 'Completed', value: bookings.filter(item => item.status === 'completed').length, detail: 'Scheduled today', tone: 'green' },
  ]
  return <>{heading}<MetricCards items={metrics} />
    <Panel title={`Current queue · ${queue.length}`} to="/admin/bookings" sx={{ mb: 2.5 }}><JobPreviewList jobs={queue.slice(0, 6).map(bookingPreview)} /></Panel>
    <Box sx={{ ...grid, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
      <Panel title={`Mechanic availability · ${currentMechanics.filter(item => item.availability === 'available').length}/${currentMechanics.length}`} to="/admin/mechanics">
        {!currentMechanics.length ? <Typography sx={small}>No active mechanics.</Typography> : <Stack spacing={1.5}>{currentMechanics.slice(0, 6).map(item => <Stack key={item._id} direction="row" justifyContent="space-between" alignItems="center" gap={1}>
          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{item.fullName}</Typography><Chip size="small" label={mechanicAvailabilityLabel(item.availability)} sx={{ bgcolor: item.availability === 'available' ? 'var(--green-soft)' : 'var(--surface-soft)' }} />
        </Stack>)}</Stack>}
      </Panel>
      <Panel title={`Service Bay availability · ${currentBays.filter(item => item.operationalStatus === 'operational' && item.availability === 'available').length}/${currentBays.length}`} to="/admin/service-bays">
        {!currentBays.length ? <Typography sx={small}>No service bays configured.</Typography> : <Stack spacing={1.5}>{currentBays.slice(0, 6).map(item => <Stack key={item._id} direction="row" justifyContent="space-between" alignItems="center" gap={1}>
          <Stack direction="row" spacing={1} alignItems="center"><GarageOutlined sx={{ color: 'var(--muted)', fontSize: 19 }} /><Typography sx={{ fontSize: 13, fontWeight: 600 }}>{item.name}</Typography></Stack>
          <Chip size="small" label={item.operationalStatus === 'operational' ? item.availability : item.operationalStatus.replaceAll('_', ' ')} sx={{ textTransform: 'capitalize', bgcolor: item.operationalStatus === 'operational' && item.availability === 'available' ? 'var(--green-soft)' : 'var(--surface-soft)' }} />
        </Stack>)}</Stack>}
      </Panel>
    </Box>
  </>
}
