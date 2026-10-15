import { DetailsButton } from '../components/RowActions'
import { DetailDialog } from '../components/RecordDetails'
import BookingRecordDetails from '../components/BookingRecordDetails'
import ConfirmationDialog from '../components/ConfirmationDialog'
import { useEffect, useState } from 'react'
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material'
import api from '../services/api'
import { statusStyles } from '../app/statuses'
import StatusChip, { StatusBadge } from '../components/StatusChip'
import { PageHeading } from '../components/DashboardParts'
import useCatalog, { message } from './useCatalog'
import RecordList, { RecordCard, RecordActions, RecordPanel } from '../components/RecordList'
import { dateLabel } from './bookingDisplay'
import AssignmentDialog from './AssignmentDialog'
import { Link, useSearchParams } from 'react-router-dom'

const actionLabels = { confirm: 'Confirm', reject: 'Reject', cancel: 'Cancel', 'check-in': 'Check In', 'no-show': 'Mark No Show' }
function sourceLabel(booking) { return booking.bookingType === 'walk-in' ? 'Walk-In' : 'Online' }
function vehicleName(vehicle) { return vehicle ? `${vehicle.make} ${vehicle.model} · ${vehicle.plateNumber}` : 'Vehicle record unavailable' }
export default function BookingList({ role }) {
  const [searchParams] = useSearchParams()
  const openId = searchParams.get('open')
  const admin = role === 'admin'
  const operator = role === 'staff' || role === 'admin'
  const business = admin || operator
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [date, setDate] = useState('')
  const { items, loading, error, setError, fieldErrors, reload, pagination } = useCatalog('/bookings', { status, search: business ? search : undefined, date: business ? date : undefined }, business)
  const [notice, setNotice] = useState('')
  const [details, setDetails] = useState(null)
  useEffect(() => {
    if (!/^[a-f\d]{24}$/i.test(openId || '')) return undefined
    const controller = new AbortController()
    api.get(`/bookings/${openId}`, { signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setDetails(response.data.item) })
      .catch(() => { if (!controller.signal.aborted) setError('Booking details could not be loaded.') })
    return () => controller.abort()
  }, [openId, setError])
  const [action, setAction] = useState(null)
  const [assignment, setAssignment] = useState(null)
  const [rescheduling, setRescheduling] = useState(null)
  const [slots, setSlots] = useState([])
  const [newSchedule, setNewSchedule] = useState('')
  const [saving, setSaving] = useState(false)
  async function applyAction() {
    if (saving || !action) return
    if (!action) return
    setSaving(true)
    try {
      const response = await api.post(`/bookings/${action.booking._id}/${action.kind}`)
      setNotice(`Booking ${action.kind === 'confirm' ? 'confirmed' : action.kind === 'reject' ? 'rejected' : action.kind === 'check-in' ? 'checked in' : action.kind === 'no-show' ? 'marked No Show' : 'cancelled'}.`)
      setDetails(response.data.item); setAction(null); reload()
    } catch (requestError) { setError(message(requestError)); setAction(null); reload() }
    finally { setSaving(false) }
  }
  async function openReschedule(booking) {
    setDetails(null); setRescheduling(booking); setNewSchedule('')
    try { setSlots((await api.get('/bookings/walk-in/options')).data.schedules || []) }
    catch (requestError) { setError(message(requestError)); setRescheduling(null) }
  }
  async function saveReschedule() {
    if (!newSchedule || saving) return
    setSaving(true)
    try { await api.post(`/bookings/${rescheduling._id}/reschedule`, { schedule: newSchedule }); setNotice('Booking rescheduled.'); setRescheduling(null); reload() }
    catch (requestError) { setError(message(requestError)) }
    finally { setSaving(false) }
  }
  function actionButtons(booking) {
    if (booking.status === 'pending') return operator ? ['confirm', 'reject', 'cancel'] : !business ? ['cancel'] : []
    if (booking.status === 'confirmed') return operator
      ? ['check-in', ...(new Date(`${booking.bookingDate}T${booking.bookingTime}:00+08:00`) <= new Date() ? ['no-show'] : []), 'cancel']
      : !business ? ['cancel'] : []
    if (booking.status === 'checked_in') return operator ? ['assign'] : []
    return []
  }
  return <>
    <PageHeading title={admin ? 'Booking monitoring' : operator ? 'Bookings' : 'My bookings'} subtitle={admin ? 'Monitor appointments and service status.' : operator ? 'Process appointments and coordinate arrivals.' : 'Follow your service appointments and view their details.'} preview={false} />
    {admin && <Button component={Link} to="/admin/walk-in" variant="contained" sx={{ mb: 2 }}>Create walk-in booking</Button>}
    {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    <RecordPanel>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2.5 }}>
        {business && <TextField size="small" label="Search reference, customer, vehicle" value={search} slotProps={{ htmlInput: { maxLength: 100 } }} onChange={event => setSearch(event.target.value)} sx={{ flex: 1 }} />}
        <TextField size="small" select label="Status" value={status} onChange={event => setStatus(event.target.value)} sx={{ minWidth: 175, ...(!admin ? { flex: 1 } : {}) }}><MenuItem value="all">All statuses</MenuItem>{Object.entries(statusStyles).map(([key, item]) => <MenuItem key={key} value={key}>{item.label}</MenuItem>)}</TextField>
        {business && <TextField size="small" label="Filter date" type="date" value={date} error={Boolean(fieldErrors.date)} helperText={fieldErrors.date} onChange={event => setDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={{ minWidth: 160 }} />}
      </Stack>
      <RecordList items={items} pagination={pagination} selectionKey={`${status}/${search}/${date}`}
        loading={loading && <Stack alignItems="center" sx={{ py: 6 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 1 }}>Loading bookings…</Typography></Stack>}
        empty="No bookings match this view.">
          {booking => <RecordCard key={booking._id}>
            <Box className="record-card-copy"><Typography sx={{ fontSize: 14, fontWeight: 650 }}>{vehicleName(booking.vehicle)}</Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', overflowWrap: 'anywhere', mt: .5 }}>{dateLabel(booking.bookingDate)} · {booking.bookingTime} · Ref {booking._id}{business && booking.client ? ` · ${booking.client.fullName}` : ''}</Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: .5 }}>{(booking.services || []).map(service => service?.name || 'Unavailable service').join(', ')}</Typography>
            </Box><RecordActions statuses={<><StatusBadge label={sourceLabel(booking)} variant="outlined" /><StatusChip status={booking.status} /></>}><DetailsButton onClick={() => setDetails(booking)}>Details</DetailsButton></RecordActions>
          </RecordCard>}
      </RecordList>
    </RecordPanel>
    <DetailDialog id="booking-details-title" open={Boolean(details)} onClose={() => setDetails(null)} title="Booking details"
      reference={details && `Reference ${details._id}`} status={details && <StatusChip status={details.status} />}
      actions={<>
        {details && actionButtons(details).map(kind => <Button variant={kind === 'confirm' || kind === 'assign' || kind === 'check-in' ? 'contained' : 'text'} key={kind} disabled={saving} color={kind === 'confirm' || kind === 'assign' ? 'primary' : 'inherit'} onClick={() => { if (kind === 'assign') setAssignment(details); else setAction({ kind, booking: details }); setDetails(null) }}>{kind === 'assign' ? 'Assign Mechanic & Bay' : actionLabels[kind]}</Button>)}
        {operator && details && ['pending', 'confirmed'].includes(details.status) && <Button onClick={() => openReschedule(details)}>Reschedule</Button>}
        {business && details && ['mechanic_assigned', 'in_service', 'final_inspection', 'ready_for_release', 'completed'].includes(details.status) && <Button variant="contained" component={Link} to={`/${role}/job-orders`}>View Job Orders</Button>}
      </>}>
      {details && <BookingRecordDetails booking={details} business={business} />}
    </DetailDialog>
    <ConfirmationDialog open={Boolean(action)} busy={saving} onCancel={() => { setDetails(action?.booking || null); setAction(null) }} onConfirm={applyAction}
      message={action?.kind === 'cancel' ? 'Are you sure you want to cancel this booking?' : `Are you sure you want to ${action?.kind === 'check-in' ? 'check in' : action?.kind} this booking?`}
      details={action?.kind === 'cancel' || action?.kind === 'reject' ? 'The appointment slot will be released.' : action?.kind === 'check-in' ? 'The customer will be marked checked in. Schedule capacity will not change.' : 'The booking will be marked confirmed.'} />
    {assignment && <AssignmentDialog booking={assignment} onClose={() => setAssignment(null)} onAssigned={() => { setAssignment(null); setNotice('Mechanic and Bay assigned. Job Order created.'); reload() }} />}
    <Dialog open={Boolean(rescheduling)} onClose={() => setRescheduling(null)} fullWidth maxWidth="sm"><DialogTitle>Reschedule booking</DialogTitle><DialogContent><TextField select fullWidth label="New schedule" value={newSchedule} onChange={event => setNewSchedule(event.target.value)} sx={{ mt: 1 }}><MenuItem value="">Select a schedule</MenuItem>{slots.filter(slot => String(slot._id) !== String(rescheduling?.schedule?._id || rescheduling?.schedule)).map(slot => <MenuItem key={slot._id} value={slot._id}>{dateLabel(slot.date)} · {slot.timeSlot}</MenuItem>)}</TextField></DialogContent><DialogActions><Button onClick={() => setRescheduling(null)}>Cancel</Button><Button disabled={!newSchedule || saving} onClick={saveReschedule}>Save</Button></DialogActions></Dialog>
  </>
}
