import { useEffect, useState } from 'react'
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../auth/AuthContext'
import { MetricCards, PageHeading, Panel } from '../components/DashboardParts'
import StatusChip from '../components/StatusChip'
import JobPreviewList from '../components/JobPreviewList'
import { bookingPreview, jobPreview, manilaToday, vehicleName } from './dashboardData'
import ClientDashboardView from '../components/ClientDashboardView'
import { fullWorkspaceWidth } from '../layouts/workspaceDimensions'
import { RecordCard, RecordActions } from '../components/RecordList'
import { DetailsButton } from '../components/RowActions'
import AdminDashboardOverview from '../components/AdminDashboardOverview'

const grid = { display: 'grid', gap: 2.5, alignItems: 'start' }
const small = { fontSize: 12, color: 'text.secondary' }
const activeStatuses = ['pending', 'confirmed', 'checked_in', 'mechanic_assigned', 'in_service', 'final_inspection', 'ready_for_release']
const progressed = ['checked_in', 'mechanic_assigned', 'in_service', 'final_inspection', 'ready_for_release']

function useDashboard(role) {
  const [state, setState] = useState({ data: null, loading: true, error: '' })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const paths = role === 'client' ? ['/bookings', '/vehicles', '/notifications', '/maintenance-reminders']
      : role === 'mechanic' ? ['/job-orders'] : role === 'staff' ? [`/bookings?date=${manilaToday()}`, '/job-orders'] : [`/bookings?date=${manilaToday()}`, '/mechanics', '/service-bays', '/people/staff', '/reports/summary']
    Promise.all(paths.map(path => api.get(path, { signal: controller.signal })))
      .then(responses => { if (!controller.signal.aborted) setState({ data: responses.map(response => response.data.items || response.data), loading: false, error: '' }) })
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
  const heading = <PageHeading title={`Welcome back, ${user.fullName.split(' ')[0]}!`} subtitle="Here's what's happening with your Toyota today." preview={false} />
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
  return <ClientDashboardView heading={heading} current={current} nextReminder={nextReminder} vehicles={vehicles} notifications={notifications} latest={latest} unread={unread} />
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
    <Box className="mechanic-dashboard-workspace" sx={{ ...fullWorkspaceWidth, ...grid, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.1fr) minmax(0, 1fr)' } }}>
      <Panel title="Active job" to="/mechanic/active-job" action="View workspace">
        {active ? <RecordCard><Box className="record-card-copy"><Typography>{vehicleName(active.booking?.vehicle)}</Typography>
          <Typography>{(active.booking?.services || []).map(item => item?.name).filter(Boolean).join(', ')} · {active.serviceBay?.name || 'Bay unavailable'}</Typography>
          <Typography>Job Order {active._id}</Typography></Box><RecordActions statuses={<StatusChip status={active.booking?.status} />}><DetailsButton component={Link} to="/mechanic/active-job" /></RecordActions></RecordCard>
          : <Typography sx={small}>No active job assigned.</Typography>}
      </Panel>
      <Panel title="Queued assignments" to="/mechanic/jobs"><JobPreviewList jobs={queued.slice(0, 5).map(jobPreview)} /></Panel>
    </Box>
  </>
}

export function AdminDashboard() {
  const state = useDashboard('admin')
  const heading = <PageHeading title="Admin Dashboard" subtitle="Monitor bookings, team capacity, and service activity." preview={false} />
  if (!state.data) return <>{heading}<DashboardState state={state} /></>
  return <>{heading}<AdminDashboardOverview data={state.data} /></>
}
export function StaffDashboard() {
  const state = useDashboard('staff')
  const heading = <PageHeading title="Staff dashboard" subtitle="Today's bookings and service work." preview={false} />
  if (!state.data) return <>{heading}<DashboardState state={state} /></>
  const [bookings, jobs] = state.data
  const count = status => bookings.filter(item => item.status === status).length
  const metrics = [
    { label: "Today's bookings", value: bookings.length, detail: `${bookings.filter(item => item.bookingType === 'online').length} online · ${bookings.filter(item => item.bookingType === 'walk-in').length} walk-ins`, tone: 'blue' },
    { label: 'Pending', value: count('pending'), detail: 'Awaiting decision', tone: 'amber' },
    { label: 'Confirmed', value: count('confirmed'), detail: 'Awaiting arrival', tone: 'blue' },
    { label: 'Checked in', value: count('checked_in'), detail: 'Awaiting assignment', tone: 'purple' },
    { label: 'In service', value: count('in_service'), detail: 'Mechanic working', tone: 'purple' },
    { label: 'Ready for release', value: count('ready_for_release'), detail: 'Awaiting completion', tone: 'green' },
    { label: 'Completed', value: count('completed'), detail: 'Scheduled today', tone: 'green' },
  ]
  return <>{heading}<MetricCards items={metrics} /><Panel title={`Today's queue · ${bookings.length}`} to="/staff/bookings" action="Process bookings"><JobPreviewList jobs={bookings.slice(0, 6).map(bookingPreview)} /></Panel><Box sx={{ mt: 2.5 }}><Panel title={`Open job orders · ${jobs.filter(item => item.status !== 'completed').length}`} to="/staff/job-orders" action="Coordinate jobs"><JobPreviewList jobs={jobs.filter(item => item.status !== 'completed').slice(0, 5).map(jobPreview)} /></Panel></Box></>
}
