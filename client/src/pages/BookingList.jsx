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
import { bookingActionKinds } from '../utils/bookingActions'

const actionLabels = { confirm: 'Confirm', reject: 'Reject', cancel: 'Cancel', 'check-in': 'Check In', 'no-show': 'Mark No Show' }
function sourceLabel(booking) { return booking.bookingType === 'walk-in' ? 'Walk-In' : 'Online' }
function vehicleName(vehicle) { return vehicle ? `${vehicle.make} ${vehicle.model} · ${vehicle.plateNumber}` : 'Vehicle record unavailable' }
export default function BookingList({ role }) {
  const [searchParams] = useSearchParams()
  const openId = searchParams.get('open')
  const section = searchParams.get('section')
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
  useEffect(() => {
    if (String(details?._id) !== openId || !['payment', 'billing', 'additional-work'].includes(section)) return undefined
    const timer = setTimeout(() => {
      const target = document.querySelector(`.record-detail-dialog [data-section="${section}"]`)
        || (section === 'billing' ? document.querySelector('.record-detail-dialog [data-section="payment"]') : null)
      target?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
    }, 0)
    return () => clearTimeout(timer)
  }, [details?._id, openId, section])
  const [action, setAction] = useState(null)
  const [serviceMileage, setServiceMileage] = useState('')
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
      const response = await api.post(`/bookings/${action.booking._id}/${action.kind}`,
        action.kind === 'check-in' && serviceMileage !== '' ? { serviceMileage: Number(serviceMileage) } : {})
      setNotice(`Booking ${action.kind === 'confirm' ? 'confirmed' : action.kind === 'reject' ? 'rejected' : action.kind === 'check-in' ? 'checked in' : action.kind === 'no-show' ? 'marked No Show' : 'cancelled'}.`)
      setDetails(response.data.item); setAction(null); setServiceMileage(''); reload()
    } catch (requestError) { setError(message(requestError)); reload() }
    finally { setSaving(false) }
  }
  async function openReschedule(booking) {
    setDetails(null); setRescheduling(booking); setNewSchedule('')
    try { setSlots((await api.get('/bookings/walk-in/options')).data.schedules || []) }
    catch (requestError) { setError(message(requestError)); setRescheduling(null) }
  }
  async function openDetails(booking) {
    try { setDetails((await api.get(`/bookings/${booking._id}`)).data.item); reload() }
    catch (requestError) { setError(message(requestError)) }
  }
  async function refreshAfterPayment() {
    if (!details?._id) return
    try { setDetails((await api.get(`/bookings/${details._id}`)).data.item); reload() }
    catch (requestError) { setError(message(requestError)) }
  }
  async function saveReschedule() {
    if (!newSchedule || saving) return
    setSaving(true)
    try { await api.post(`/bookings/${rescheduling._id}/reschedule`, { schedule: newSchedule }); setNotice('Booking rescheduled.'); setRescheduling(null); reload() }
    catch (requestError) { setError(message(requestError)) }
    finally { setSaving(false) }
  }
  function actionButtons(booking) {
    return bookingActionKinds(booking, role)
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
              {booking.holdReleaseReason === 'expired' && <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: .5 }}>Downpayment window expired</Typography>}
            </Box><RecordActions statuses={<><StatusBadge label={sourceLabel(booking)} variant="outlined" /><StatusChip status={booking.status} /></>}><DetailsButton onClick={() => openDetails(booking)}>Details</DetailsButton></RecordActions>
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
      {details && <BookingRecordDetails booking={details} business={business} role={role} onPaymentDecision={refreshAfterPayment} />}
    </DetailDialog>
    <ConfirmationDialog open={Boolean(action)} busy={saving} onCancel={() => { setDetails(action?.booking || null); setAction(null); setServiceMileage('') }} onConfirm={applyAction}
      message={action?.kind === 'cancel' ? 'Are you sure you want to cancel this booking?' : `Are you sure you want to ${action?.kind === 'check-in' ? 'check in' : action?.kind} this booking?`}
      details={action?.kind === 'cancel' || action?.kind === 'reject' ? 'The appointment slot will be released.' : action?.kind === 'check-in' ? 'Record the odometer if available. The customer will be marked checked in.' : 'The booking will be marked confirmed.'}>
      {action?.kind === 'check-in' && <TextField label="Service mileage / odometer (km, optional)" type="number" fullWidth value={serviceMileage}
        onChange={event => setServiceMileage(event.target.value)} slotProps={{ htmlInput: { min: 0, max: 9999999, step: 1 } }} />}
    </ConfirmationDialog>
    {assignment && <AssignmentDialog booking={assignment} onClose={() => setAssignment(null)} onAssigned={() => { setAssignment(null); setNotice('Mechanic and Bay assigned. Job Order created.'); reload() }} />}
    <Dialog open={Boolean(rescheduling)} onClose={() => setRescheduling(null)} fullWidth maxWidth="sm"><DialogTitle>Reschedule booking</DialogTitle><DialogContent><TextField select fullWidth label="New schedule" value={newSchedule} onChange={event => setNewSchedule(event.target.value)} sx={{ mt: 1 }}><MenuItem value="">Select a schedule</MenuItem>{slots.filter(slot => String(slot._id) !== String(rescheduling?.schedule?._id || rescheduling?.schedule)).map(slot => <MenuItem key={slot._id} value={slot._id}>{dateLabel(slot.date)} · {slot.timeSlot}</MenuItem>)}</TextField></DialogContent><DialogActions><Button onClick={() => setRescheduling(null)}>Cancel</Button><Button disabled={!newSchedule || saving} onClick={saveReschedule}>Save</Button></DialogActions></Dialog>
  </>
}
