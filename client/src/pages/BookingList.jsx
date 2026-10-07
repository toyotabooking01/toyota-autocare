import { useState } from 'react'
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import api from '../services/api'
import { statusStyles } from '../app/statuses'
import StatusChip from '../components/StatusChip'
import { PageHeading } from '../components/DashboardParts'
import useCatalog, { message } from './useCatalog'
import { dateLabel, money } from './bookingDisplay'
import AssignmentDialog from './AssignmentDialog'
import { Link } from 'react-router-dom'

const actionLabels = { confirm: 'Confirm', reject: 'Reject', cancel: 'Cancel', 'check-in': 'Check In' }
function sourceLabel(booking) { return booking.bookingType === 'walk-in' ? 'Walk-In' : 'Online' }
function estimate(booking) { return (booking.services || []).reduce((sum, service) => sum + Number(service?.estimatedPrice || 0), 0) }
function vehicleName(vehicle) { return vehicle ? `${vehicle.make} ${vehicle.model} · ${vehicle.plateNumber}` : 'Vehicle record unavailable' }
export default function BookingList({ role }) {
  const admin = role === 'admin'
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [date, setDate] = useState('')
  const { items, loading, error, setError, reload } = useCatalog('/bookings', { status, search: admin ? search : undefined, date: admin ? date : undefined })
  const [notice, setNotice] = useState('')
  const [details, setDetails] = useState(null)
  const [action, setAction] = useState(null)
  const [assignment, setAssignment] = useState(null)
  const [saving, setSaving] = useState(false)
  async function applyAction() {
    if (!action) return
    setSaving(true)
    try {
      const response = await api.post(`/bookings/${action.booking._id}/${action.kind}`)
      setNotice(`Booking ${action.kind === 'confirm' ? 'confirmed' : action.kind === 'reject' ? 'rejected' : action.kind === 'check-in' ? 'checked in' : 'cancelled'}.`)
      setDetails(response.data.item); setAction(null); reload()
    } catch (requestError) { setError(message(requestError)); setAction(null); reload() }
    finally { setSaving(false) }
  }
  function actionButtons(booking) {
    if (booking.status === 'pending') return admin ? ['confirm', 'reject', 'cancel'] : ['cancel']
    if (booking.status === 'confirmed') return admin ? ['check-in', 'cancel'] : ['cancel']
    if (booking.status === 'checked_in') return admin ? ['assign'] : []
    return []
  }
  return <>
    <PageHeading title={admin ? 'Bookings' : 'My bookings'} subtitle={admin ? 'Review upcoming appointments and manage early booking decisions.' : 'Follow your service appointments and view their details.'} preview={false} />
    {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderColor: '#e5eaf1', borderRadius: 2.5 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2.5 }}>
        {admin && <TextField size="small" label="Search reference, customer, vehicle" value={search} onChange={event => setSearch(event.target.value)} sx={{ flex: 1 }} />}
        <TextField size="small" select label="Status" value={status} onChange={event => setStatus(event.target.value)} sx={{ minWidth: 175, ...(!admin ? { flex: 1 } : {}) }}><MenuItem value="all">All statuses</MenuItem>{Object.entries(statusStyles).map(([key, item]) => <MenuItem key={key} value={key}>{item.label}</MenuItem>)}</TextField>
        {admin && <TextField size="small" label="Filter date" type="date" value={date} onChange={event => setDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={{ minWidth: 160 }} />}
      </Stack>
      {loading ? <Stack alignItems="center" sx={{ py: 6 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 1 }}>Loading bookings…</Typography></Stack>
        : !items.length ? <Typography sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>No bookings match this view.</Typography>
          : <Stack spacing={1}>{items.map(booking => <Box key={booking._id} sx={{ p: 2, border: '1px solid #e9edf2', borderRadius: 2, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' }, gap: 2, minWidth: 0 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}><Typography sx={{ fontSize: 14, fontWeight: 650 }}>{vehicleName(booking.vehicle)}</Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', overflowWrap: 'anywhere', mt: .5 }}>{dateLabel(booking.bookingDate)} · {booking.bookingTime} · Ref {booking._id}{admin && booking.client ? ` · ${booking.client.fullName}` : ''}</Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: .5 }}>{(booking.services || []).map(service => service?.name || 'Unavailable service').join(', ')}</Typography>
            </Box><Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center"><Chip size="small" label={sourceLabel(booking)} variant="outlined" sx={{ fontSize: 11, borderColor: '#dce3ec', color: 'text.secondary' }} /><StatusChip status={booking.status} /><Button size="small" variant="outlined" onClick={() => setDetails(booking)}>Details</Button></Stack>
          </Box>)}</Stack>}
    </Paper>
    <Dialog open={Boolean(details)} onClose={() => setDetails(null)} fullWidth maxWidth="sm" aria-labelledby="booking-details-title">
      <DialogTitle id="booking-details-title">Booking details</DialogTitle><DialogContent>{details && <Stack spacing={2} sx={{ pt: 1 }}>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', overflowWrap: 'anywhere' }}>Reference {details._id}</Typography>
        <Box><StatusChip status={details.status} /></Box>
        <Box><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Booking source</Typography><Typography sx={{ fontSize: 13 }}>{sourceLabel(details)}</Typography></Box>
        {admin && <Box><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Client</Typography><Typography sx={{ fontSize: 13 }}>{details.client?.fullName || 'Client record unavailable'}</Typography></Box>}
        <Box><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Vehicle</Typography><Typography sx={{ fontSize: 13 }}>{vehicleName(details.vehicle)}{details.vehicle?.isArchived ? ' (archived)' : ''}</Typography></Box>
        <Box><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Schedule</Typography><Typography sx={{ fontSize: 13 }}>{dateLabel(details.bookingDate)} · {details.bookingTime}</Typography></Box>
        <Box><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Services</Typography>{(details.services || []).map((service, index) => <Stack key={service?._id || index} direction="row" justifyContent="space-between" gap={2}><Typography sx={{ fontSize: 13 }}>{service?.name || 'Service record unavailable'}{service?.isArchived ? ' (archived)' : ''}</Typography><Typography sx={{ fontSize: 13 }}>{service ? money(service.estimatedPrice) : '—'}</Typography></Stack>)}</Box>
        <Box><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Current catalog estimate</Typography><Typography sx={{ fontWeight: 650 }}>{money(estimate(details))}</Typography><Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Prices may have changed since this booking was made.</Typography></Box>
        {details.concern && <Box><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Concern</Typography><Typography sx={{ fontSize: 13 }}>{details.concern}</Typography></Box>}
      </Stack>}</DialogContent><DialogActions sx={{ p: 2, display: 'flex', flexWrap: 'wrap' }}>
        {details && actionButtons(details).map(kind => <Button key={kind} disabled={saving} color={kind === 'confirm' || kind === 'assign' ? 'primary' : 'inherit'} onClick={() => { if (kind === 'assign') setAssignment(details); else setAction({ kind, booking: details }); setDetails(null) }}>{kind === 'assign' ? 'Assign Mechanic & Bay' : actionLabels[kind]}</Button>)}
        {admin && details && ['mechanic_assigned', 'in_service', 'final_inspection', 'ready_for_release', 'completed'].includes(details.status) && <Button component={Link} to="/admin/job-orders">View Job Orders</Button>}
        <Button onClick={() => setDetails(null)}>Close</Button>
      </DialogActions>
    </Dialog>
    <Dialog open={Boolean(action)} onClose={() => { if (!saving) setAction(null) }} aria-labelledby="booking-action-title"><DialogTitle id="booking-action-title">{action && `${actionLabels[action.kind]} booking?`}</DialogTitle><DialogContent><Typography sx={{ fontSize: 13 }}>{action?.kind === 'cancel' || action?.kind === 'reject' ? 'The appointment slot will be released.' : action?.kind === 'check-in' ? 'The customer will be marked checked in. Schedule capacity will not change.' : 'The booking will be marked confirmed.'}</Typography></DialogContent><DialogActions sx={{ p: 2 }}><Button disabled={saving} onClick={() => setAction(null)}>Back</Button><Button disabled={saving} variant="contained" onClick={applyAction}>{saving ? 'Saving…' : action ? actionLabels[action.kind] : 'Continue'}</Button></DialogActions></Dialog>
    {assignment && <AssignmentDialog booking={assignment} onClose={() => setAssignment(null)} onAssigned={() => { setAssignment(null); setNotice('Mechanic and Bay assigned. Job Order created.'); reload() }} />}
  </>
}
