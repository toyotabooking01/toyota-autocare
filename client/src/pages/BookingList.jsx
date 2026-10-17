import { DetailsButton } from '../components/RowActions'
import { DetailDialog } from '../components/RecordDetails'
import BookingRecordDetails from '../components/BookingRecordDetails'
import ConfirmationDialog from '../components/ConfirmationDialog'
import { useEffect, useState } from 'react'
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, MenuItem, Stack, Tab, Tabs, TextField, Typography } from '@mui/material'
import { Calendar, Car, Clock, CreditCard, NavArrowRight, Plus, Search as SearchIcon, Xmark } from 'iconoir-react'
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
import StaffWalkIn from './StaffWalkIn'
import '../bookingMonitoring.css'

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
  const [bookingDetailsTab, setBookingDetailsTab] = useState('overview')
  useEffect(() => {
    if (!/^[a-f\d]{24}$/i.test(openId || '')) return undefined
    const controller = new AbortController()
    api.get(`/bookings/${openId}`, { signal: controller.signal })
      .then(response => {
        if (!controller.signal.aborted) {
          setDetails(response.data.item)
          setBookingDetailsTab(section === 'billing' || section === 'payment' ? 'billing' : section === 'additional-work' ? 'activity' : 'overview')
        }
      })
      .catch(() => { if (!controller.signal.aborted) setError('Booking details could not be loaded.') })
    return () => controller.abort()
  }, [openId, section, setError])
  useEffect(() => {
    if (String(details?._id) !== openId || !['payment', 'billing', 'additional-work'].includes(section)) return undefined
    const timer = setTimeout(() => {
      const target = document.querySelector(`.record-detail-dialog [data-section="${section}"]`)
        || (section === 'billing' ? document.querySelector('.record-detail-dialog [data-section="payment"]') : null)
      target?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
    }, 0)
    return () => clearTimeout(timer)
  }, [details?._id, openId, section, bookingDetailsTab])
  const [action, setAction] = useState(null)
  const [serviceMileage, setServiceMileage] = useState('')
  const [assignment, setAssignment] = useState(null)
  const [rescheduling, setRescheduling] = useState(null)
  const [slots, setSlots] = useState([])
  const [newSchedule, setNewSchedule] = useState('')
  const [saving, setSaving] = useState(false)
  const [walkInOpen, setWalkInOpen] = useState(false)
  const [walkInBusy, setWalkInBusy] = useState(false)
  const [walkInAction, setWalkInAction] = useState(null)
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
    try { setBookingDetailsTab('overview'); setDetails((await api.get(`/bookings/${booking._id}`)).data.item); reload() }
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
  function finishWalkIn() {
    setWalkInOpen(false)
    setWalkInBusy(false)
    setWalkInAction(null)
    setNotice('Walk-in booking created successfully. The customer is checked in.')
    reload()
  }
  function closeWalkIn() {
    if (walkInBusy) return
    setWalkInOpen(false)
    setWalkInAction(null)
  }
  return <Box className={admin ? 'booking-monitoring-page' : 'booking-list-page'}>
    <PageHeading title={admin ? 'Booking Monitoring' : operator ? 'Bookings' : 'My bookings'} subtitle={admin ? 'Monitor appointments and service status.' : operator ? 'Process appointments and coordinate arrivals.' : 'Follow your service appointments and view their details.'} preview={false} />
    {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    <RecordPanel className={admin ? 'booking-monitoring-surface admin-list-surface' : undefined}>
      <Stack className={admin ? 'booking-monitoring-toolbar admin-list-toolbar' : undefined} direction={{ xs: 'column', md: 'row' }} spacing={admin ? 0 : 1.5} sx={{ mb: 2.5 }}>
        {business && <TextField className={admin ? 'booking-monitoring-search' : undefined} size="small" label={admin ? 'Search bookings' : 'Search reference, customer, vehicle'} placeholder={admin ? 'Search reference, customer, vehicle' : undefined} value={search} slotProps={{ htmlInput: { maxLength: 100, 'aria-label': 'Search reference, customer, vehicle' }, input: admin ? { startAdornment: <InputAdornment position="start"><SearchIcon width={17} height={17} strokeWidth={1.7} /></InputAdornment> } : undefined }} onChange={event => setSearch(event.target.value)} sx={{ flex: 1 }} />}
        <TextField className={admin ? 'booking-monitoring-status-filter' : undefined} size="small" select label="Status" value={status} onChange={event => setStatus(event.target.value)} sx={{ minWidth: 175, ...(!admin ? { flex: 1 } : {}) }}><MenuItem value="all">All statuses</MenuItem>{Object.entries(statusStyles).map(([key, item]) => <MenuItem key={key} value={key}>{item.label}</MenuItem>)}</TextField>
        {business && <TextField className={admin ? 'booking-monitoring-date-filter' : undefined} size="small" label="Filter date" type="date" value={date} error={Boolean(fieldErrors.date)} helperText={fieldErrors.date} onChange={event => setDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={{ minWidth: 160 }} />}
        {admin && <Button className="booking-walk-in" variant="contained" aria-label="Walk In" onClick={() => setWalkInOpen(true)} startIcon={<Plus width={17} height={17} strokeWidth={1.8} aria-hidden="true" />}>Walk In</Button>}
      </Stack>
      {admin && <Box className="booking-monitoring-header admin-list-header" aria-hidden="true"><span>Vehicle</span><span>Schedule</span><span>Service</span><span>Customer</span><span>Source</span><span>Status</span><span>Details</span></Box>}
      <RecordList className={admin ? 'booking-monitoring-list' : ''} items={items} pagination={pagination} selectionKey={`${status}/${search}/${date}`}
        loading={loading && <Stack alignItems="center" sx={{ py: 6 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 1 }}>Loading bookings…</Typography></Stack>}
        empty="No bookings match this view.">
          {booking => admin ? <Box component="article" key={booking._id} className="booking-monitoring-row admin-list-row">
            <Box className="booking-monitoring-vehicle">
              <Car className="booking-monitoring-vehicle-icon" width={22} height={22} strokeWidth={1.6} aria-hidden="true" />
              <Box className="booking-monitoring-vehicle-copy">
                <Typography className="booking-monitoring-vehicle-name" title={booking.vehicle ? `${booking.vehicle.make} ${booking.vehicle.model}` : 'Vehicle record unavailable'}>{booking.vehicle ? `${booking.vehicle.make} ${booking.vehicle.model}` : 'Vehicle record unavailable'}</Typography>
                <Typography className="booking-monitoring-plate">{booking.vehicle?.plateNumber || 'Plate unavailable'}</Typography>
                <Typography className="booking-monitoring-reference" title={`Full booking reference: ${booking._id}`}>Ref {String(booking._id).length > 12 ? `${String(booking._id).slice(0, 8)}…` : booking._id}</Typography>
              </Box>
            </Box>
            <Typography className="booking-monitoring-schedule"><span>{dateLabel(booking.bookingDate)}</span><span>{booking.bookingTime}</span></Typography>
            <Typography className="booking-monitoring-service" title={(booking.services || []).map(service => service?.name || 'Unavailable service').join(', ') || 'Service unavailable'}>{(booking.services || []).map(service => service?.name || 'Unavailable service').join(', ') || 'Service unavailable'}</Typography>
            <Typography className="booking-monitoring-customer" title={booking.client?.fullName || 'Customer unavailable'}>{booking.client?.fullName || 'Customer unavailable'}</Typography>
            <Typography className="booking-monitoring-source" title={sourceLabel(booking)}>{sourceLabel(booking)}</Typography>
            <Box className="booking-monitoring-status" title={statusStyles[booking.status]?.label || 'Unknown status'}><StatusChip status={booking.status} minimal /></Box>
            <Button className="booking-monitoring-details admin-list-details" variant="text" onClick={() => openDetails(booking)} aria-label={`Details for ${booking.vehicle?.plateNumber || vehicleName(booking.vehicle)}`}>Details<NavArrowRight width={16} height={16} strokeWidth={1.7} aria-hidden="true" /></Button>
          </Box> : <RecordCard key={booking._id}>
            <Box className="record-card-copy"><Typography sx={{ fontSize: 14, fontWeight: 650 }}>{vehicleName(booking.vehicle)}</Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', overflowWrap: 'anywhere', mt: .5 }}>{dateLabel(booking.bookingDate)} · {booking.bookingTime} · Ref {booking._id}{business && booking.client ? ` · ${booking.client.fullName}` : ''}</Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: .5 }}>{(booking.services || []).map(service => service?.name || 'Unavailable service').join(', ')}</Typography>
              {booking.holdReleaseReason === 'expired' && <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: .5 }}>Downpayment window expired</Typography>}
            </Box><RecordActions statuses={<><StatusBadge label={sourceLabel(booking)} variant="outlined" /><StatusChip status={booking.status} /></>}><DetailsButton onClick={() => openDetails(booking)}>Details</DetailsButton></RecordActions>
          </RecordCard>}
      </RecordList>
    </RecordPanel>
    <DetailDialog id="booking-details-title" className={admin ? 'booking-record-detail-dialog' : undefined} open={Boolean(details)} onClose={() => setDetails(null)} title="Booking details"
      reference={details && `Reference ${admin && String(details._id).length > 16 ? `${String(details._id).slice(0, 8)}…${String(details._id).slice(-4)}` : details._id}`} status={details && <StatusChip status={details.status} minimal={admin} />}
      navigation={admin && <Tabs className="booking-details-tabs" value={bookingDetailsTab} onChange={(_, value) => setBookingDetailsTab(value)} variant="scrollable" allowScrollButtonsMobile aria-label="Booking detail sections">
        <Tab value="overview" label="Overview" icon={<Calendar width={18} height={18} strokeWidth={1.7} />} iconPosition="start" />
        <Tab value="billing" label="Billing" icon={<CreditCard width={18} height={18} strokeWidth={1.7} />} iconPosition="start" />
        <Tab value="activity" label="Activity" icon={<Clock width={18} height={18} strokeWidth={1.7} />} iconPosition="start" />
      </Tabs>}
      actions={<>
        {details && actionButtons(details).map(kind => <Button variant={kind === 'confirm' || kind === 'assign' || kind === 'check-in' ? 'contained' : 'text'} key={kind} disabled={saving} color={kind === 'confirm' || kind === 'assign' ? 'primary' : 'inherit'} onClick={() => { if (kind === 'assign') setAssignment(details); else setAction({ kind, booking: details }); setDetails(null) }}>{kind === 'assign' ? 'Assign Mechanic & Bay' : actionLabels[kind]}</Button>)}
        {operator && details && ['pending', 'confirmed'].includes(details.status) && <Button onClick={() => openReschedule(details)}>Reschedule</Button>}
        {business && details && ['mechanic_assigned', 'in_service', 'final_inspection', 'ready_for_release', 'completed'].includes(details.status) && <Button variant="contained" component={Link} to={`/${role}/job-orders`}>View Job Orders</Button>}
      </>}>
      {details && <BookingRecordDetails booking={details} business={business} role={role} view={admin ? bookingDetailsTab : 'all'} adminDetail={admin} onPaymentDecision={refreshAfterPayment} />}
    </DetailDialog>
    <ConfirmationDialog open={Boolean(action)} busy={saving} onCancel={() => { setDetails(action?.booking || null); setAction(null); setServiceMileage('') }} onConfirm={applyAction}
      message={action?.kind === 'cancel' ? 'Are you sure you want to cancel this booking?' : `Are you sure you want to ${action?.kind === 'check-in' ? 'check in' : action?.kind} this booking?`}
      details={action?.kind === 'cancel' || action?.kind === 'reject' ? 'The appointment slot will be released.' : action?.kind === 'check-in' ? 'Record the odometer if available. The customer will be marked checked in.' : 'The booking will be marked confirmed.'}>
      {action?.kind === 'check-in' && <TextField label="Service mileage / odometer (km, optional)" type="number" fullWidth value={serviceMileage}
        onChange={event => setServiceMileage(event.target.value)} slotProps={{ htmlInput: { min: 0, max: 9999999, step: 1 } }} />}
    </ConfirmationDialog>
    {assignment && <AssignmentDialog booking={assignment} onClose={() => setAssignment(null)} onAssigned={() => { setAssignment(null); setNotice('Mechanic and Bay assigned. Job Order created.'); reload() }} />}
    <Dialog open={Boolean(rescheduling)} onClose={() => setRescheduling(null)} fullWidth maxWidth="sm"><DialogTitle>Reschedule booking</DialogTitle><DialogContent><TextField select fullWidth label="New schedule" value={newSchedule} onChange={event => setNewSchedule(event.target.value)} sx={{ mt: 1 }}><MenuItem value="">Select a schedule</MenuItem>{slots.filter(slot => String(slot._id) !== String(rescheduling?.schedule?._id || rescheduling?.schedule)).map(slot => <MenuItem key={slot._id} value={slot._id}>{dateLabel(slot.date)} · {slot.timeSlot}</MenuItem>)}</TextField></DialogContent><DialogActions><Button onClick={() => setRescheduling(null)}>Cancel</Button><Button disabled={!newSchedule || saving} onClick={saveReschedule}>Save</Button></DialogActions></Dialog>
    {admin && <Dialog open={walkInOpen} onClose={closeWalkIn} fullWidth maxWidth={false} className="walk-in-booking-dialog" aria-labelledby="walk-in-booking-dialog-title">
      <DialogTitle id="walk-in-booking-dialog-title" className="walk-in-booking-dialog-title">
        <span>Walk-In Booking</span>
        <IconButton aria-label="Close Walk-In Booking" disabled={walkInBusy} onClick={closeWalkIn} size="small"><Xmark width={20} height={20} strokeWidth={1.7} /></IconButton>
      </DialogTitle>
      <DialogContent dividers><StaffWalkIn role="admin" embedded onBusy={setWalkInBusy} onComplete={finishWalkIn} onFooterActionChange={setWalkInAction} /></DialogContent>
      <DialogActions className="walk-in-booking-actions">
        <Box className="walk-in-booking-actions-back">
          {walkInAction?.showBack && <Button disabled={walkInBusy} onClick={walkInAction.onBack}>Back</Button>}
        </Box>
        <Box className="walk-in-booking-actions-primary">
          <Button onClick={closeWalkIn} disabled={walkInBusy}>Cancel</Button>
          {walkInAction && <Button variant="contained" disabled={walkInBusy || walkInAction.disabled} onClick={walkInAction.onClick}>{walkInBusy ? 'Creating…' : walkInAction.primaryLabel}</Button>}
        </Box>
      </DialogActions>
    </Dialog>}
  </Box>
}
