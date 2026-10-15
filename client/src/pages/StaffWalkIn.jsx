import BookingRecordDetails from '../components/BookingRecordDetails'
import FormWorkspace from '../components/FormWorkspace'
import { formWorkspaceGrid } from '../layouts/workspaceDimensions'
import { useConfirmation } from '../components/ConfirmationContext'
import useFormValidation from '../components/useFormValidation'
import { useEffect, useState } from 'react'
import { Alert, Box, Button, CircularProgress, Paper, Stack, Step, StepLabel, Stepper, TextField, Typography } from '@mui/material'
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined'
import RadioButtonUncheckedOutlined from '@mui/icons-material/RadioButtonUncheckedOutlined'
import { Link } from 'react-router-dom'
import api from '../services/api'
import { PageHeading } from '../components/DashboardParts'
import { money } from './bookingDisplay'
import { message } from './useCatalog'
import NewWalkInForm from './NewWalkInForm'
import { ToggleButton, ToggleButtonGroup } from '@mui/material'
import BookingDateTimePicker from '../components/BookingDateTimePicker'
import WalkInVehicleDialog from './WalkInVehicleDialog'

const steps = ['Customer', 'Vehicle', 'Services', 'Date & Time', 'Review']
const choiceStyle = { p: 2, border: '1px solid var(--line)', borderRadius: 2, cursor: 'pointer', minWidth: 0, textAlign: 'left' }
export default function StaffWalkIn({ role = 'staff' }) {
  const confirm = useConfirmation()
  const [step, setStep] = useState(0)
  const [customerType, setCustomerType] = useState('existing')
  const [search, setSearch] = useState('')
  const [clients, setClients] = useState([])
  const [client, setClient] = useState(null)
  const [searching, setSearching] = useState(false)
  const [vehicles, setVehicles] = useState([])
  const [vehicleId, setVehicleId] = useState('')
  const [services, setServices] = useState([])
  const [serviceIds, setServiceIds] = useState([])
  const [concern, setConcern] = useState('')
  const [concernError, setConcernError] = useState(false)
  const [selectedDate, setSelectedDate] = useState('')
  const [slot, setSlot] = useState(null)
  const validationSlots = slot ? [{ _id: slot.scheduleId, isEnabled: true, date: selectedDate, timeSlot: slot.time, maximumCapacity: 1, currentBookingCount: 0 }] : []
  const validation = useFormValidation('booking', { client: client?._id, vehicle: vehicleId, services: serviceIds, schedule: slot?.scheduleId || '' }, { available: { vehicle: vehicles, services, schedule: validationSlots, client: clients } })
  const [loading, setLoading] = useState(true)
  const [loadingVehicles, setLoadingVehicles] = useState(false)
  const [vehicleLoadError, setVehicleLoadError] = useState(false)
  const [vehicleReload, setVehicleReload] = useState(0)
  const [addingVehicle, setAddingVehicle] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [completed, setCompleted] = useState(null)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    api.get('/bookings/walk-in/options', { signal: controller.signal })
      .then(response => {
        const serviceOptions = response.data?.services
        if (!Array.isArray(serviceOptions)) throw new Error('Walk-In options are unavailable.')
        setServices(serviceOptions)
        setServiceIds(current => current.filter(id => serviceOptions.some(item => item._id === id)))
      })
      .catch(requestError => { if (!controller.signal.aborted) { setServices([]); setError(message(requestError)) } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [refresh])
  useEffect(() => {
    if (search.trim().length < 2) return undefined
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setSearching(true)
      api.get('/bookings/walk-in/clients', { params: { search }, signal: controller.signal })
        .then(response => setClients(response.data.items))
        .catch(requestError => { if (!controller.signal.aborted) setError(message(requestError)) })
        .finally(() => { if (!controller.signal.aborted) setSearching(false) })
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [search])
  useEffect(() => {
    if (!client) return undefined
    const controller = new AbortController()
    api.get(`/bookings/walk-in/clients/${client._id}/vehicles`, { signal: controller.signal })
      .then(response => {
        const vehicleOptions = response.data?.items
        if (!Array.isArray(vehicleOptions)) throw new Error('Vehicle options are unavailable.')
        setVehicles(vehicleOptions)
      })
      .catch(() => { if (!controller.signal.aborted) { setVehicles([]); setVehicleLoadError(true) } })
      .finally(() => { if (!controller.signal.aborted) setLoadingVehicles(false) })
    return () => controller.abort()
  }, [client, vehicleReload])
  const vehicle = vehicles.find(item => item._id === vehicleId)
  const chosen = services.filter(item => serviceIds.includes(item._id))
  const otherService = chosen.find(item => item.isOtherService)
  const estimate = chosen.reduce((sum, item) => sum + Number(item.estimatedPrice || 0), 0)
  const canContinue = [Boolean(client), Boolean(vehicle), chosen.length > 0, Boolean(slot), true][step]
  function chooseClient(item) { setClient(item); setVehicleId(''); setVehicles([]); setLoadingVehicles(true); setVehicleLoadError(false); setError('') }
  function toggleService(serviceId) { setServiceIds(current => current.includes(serviceId) ? current.filter(id => id !== serviceId) : current.length < 20 ? [...current, serviceId] : current); setSlot(null) }
  function continueStep() {
    if (step === 2 && otherService && !concern.trim()) { setConcernError(true); return }
    setConcernError(false); setStep(value => value + 1)
  }
  async function submit() {
    if (saving) return
    if (otherService && !concern.trim()) { setConcernError(true); setStep(2); return }
    if (!validation.validate()) { setStep(({ client: 0, vehicle: 1, services: 2, schedule: 3 })[validation.firstError()] ?? 0); return }
    return confirm('Create this walk-in service booking?', async () => {
      if (!validation.validate()) { setStep(({ client: 0, vehicle: 1, services: 2, schedule: 3 })[validation.firstError()] ?? 0); return }
      setSaving(true); setError('')
      try {
        const response = await api.post('/bookings/walk-in', { client: client._id, vehicle: vehicleId, services: serviceIds, schedule: slot.scheduleId, concern })
        setCompleted(response.data.item)
      } catch (requestError) {
        validation.receive(requestError)
        const fields = requestError.response?.data?.errors || {}
        if (fields.client) setStep(0)
        else if (fields.vehicle) setStep(1)
        else if (fields.services) setStep(2)
        else if (fields.schedule) setStep(3)
        if (requestError.response?.status === 409) {
          setSlot(null)
          setError(Object.keys(fields).length ? '' : message(requestError))
          setStep(3); setRefresh(value => value + 1)
        } else { setError(Object.keys(fields).length ? '' : message(requestError)); if (requestError.response?.status === 400) setRefresh(value => value + 1) }
      } finally { setSaving(false) }
    })
  }
  return <>
    <PageHeading title="Walk-In Service" subtitle="Create a checked-in service visit for an existing or new customer." preview={false} />
    <ToggleButtonGroup exclusive value={customerType} aria-label="Customer type" size="small" sx={{ mb: 2 }} disabled={saving || Boolean(completed)}
      onChange={(_, value) => { if (value) { setCustomerType(value); setError('') } }}>
      <ToggleButton value="existing">Existing Customer</ToggleButton><ToggleButton value="new">New Walk-In Customer</ToggleButton>
    </ToggleButtonGroup>
    <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 2 }}>
      {customerType === 'existing' ? 'Customer already exists in the system.' : 'Create a walk-in customer record and service request.'}
    </Typography>
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    {customerType === 'new' ? <NewWalkInForm role={role} services={services} loading={loading} refreshKey={refresh} onRefresh={() => setRefresh(value => value + 1)} onBusy={setSaving} onComplete={setCompleted} /> : <FormWorkspace>
      {loading ? <Stack alignItems="center" sx={{ py: 8 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 1 }}>Loading walk-in options…</Typography></Stack>
        : completed ? <Stack spacing={2} alignItems="flex-start" sx={{ py: 4 }}>
          <Alert severity="success">Walk-in booking created successfully. The customer is checked in.</Alert>
          <Typography sx={{ fontSize: 13, overflowWrap: 'anywhere' }}>Reference: {completed._id}</Typography>
          <Stack direction="row" spacing={1}><Button component={Link} to={`/${role}/bookings?open=${completed._id}`} variant="contained">View Booking</Button><Button component={Link} to={`/${role}/job-orders`}>Continue to Job Coordination</Button></Stack>
        </Stack> : <>
          <Stepper activeStep={step} alternativeLabel sx={{ mb: 4, display: { xs: 'none', sm: 'flex' } }}>{steps.map(label => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}</Stepper>
          <Typography sx={{ display: { sm: 'none' }, fontSize: 12, color: 'text.secondary', mb: 2 }}>Step {step + 1} of 5 · {steps[step]}</Typography>
          {step === 0 && <>{validation.errors.client && <Alert severity="error" sx={{ mb: 2 }}>{validation.errors.client}</Alert>}<Typography component="h2" sx={{ fontSize: 18, fontWeight: 700, mb: 1 }}>Find the customer</Typography>
            <TextField name="customerSearch" label="Search customer by name, email, or phone" value={search} slotProps={{ htmlInput: { maxLength: 100 } }} onChange={event => { setSearch(event.target.value); setSearching(event.target.value.trim().length >= 2); setClients([]); setClient(null); setVehicleId(''); setVehicles([]) }} fullWidth size="small" helperText="Enter at least two characters. Active online and walk-in customers appear." />
            {searching && <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 2 }}>Searching…</Typography>}
            {search.trim().length >= 2 && !searching && !clients.length && <Alert severity="info" sx={{ mt: 2 }}>No active customer found. Choose New Walk-In Customer to create one.</Alert>}
            <Stack spacing={1} sx={{ mt: 2 }}>{clients.map(item => <Paper key={item._id} component="button" type="button" variant="outlined" onClick={() => chooseClient(item)} aria-pressed={client?._id === item._id} sx={{ ...choiceStyle, borderColor: client?._id === item._id ? 'primary.main' : 'var(--line)', bgcolor: client?._id === item._id ? 'var(--accent-soft)' : 'var(--surface)' }}><Typography sx={{ fontWeight: 650 }}>{item.fullName}</Typography><Typography sx={{ color: 'text.secondary', fontSize: 12 }}>{item.phone || 'No phone'} · {item.email || 'No email'} · {item.vehicleCount} vehicles · {item.isWalkInCustomer ? 'Walk-In Customer' : 'Online Client'}</Typography></Paper>)}</Stack>
          </>}
          {step === 1 && <>{validation.errors.vehicle && <Alert severity="error" sx={{ mb: 2 }}>{validation.errors.vehicle}</Alert>}<Typography component="h2" sx={{ fontSize: 18, fontWeight: 700, mb: 2 }}>Choose {client?.fullName}'s vehicle</Typography>
            {loadingVehicles ? <Stack direction="row" spacing={1.5} alignItems="center" role="status"><CircularProgress size={22} /><Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Loading this client’s vehicles…</Typography></Stack>
              : vehicleLoadError ? <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => { setVehicleLoadError(false); setLoadingVehicles(true); setVehicleReload(value => value + 1) }}>Retry</Button>}>Could not load this client’s vehicles. Please try again.</Alert>
                : !vehicles.length ? <Alert severity="info">This customer has no registered vehicle. Add the vehicle they brought in.</Alert>
                  : <Box sx={formWorkspaceGrid}>{vehicles.map(item => <Paper key={item._id} component="button" type="button" variant="outlined" onClick={() => setVehicleId(item._id)} aria-pressed={vehicleId === item._id} sx={{ ...choiceStyle, borderColor: vehicleId === item._id ? 'primary.main' : 'var(--line)', bgcolor: vehicleId === item._id ? 'var(--accent-soft)' : 'var(--surface)' }}><Typography sx={{ fontWeight: 650 }}>{item.make} {item.model} {item.year}</Typography><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{item.plateNumber}</Typography></Paper>)}</Box>}
            <Button sx={{ mt: 2 }} variant="outlined" disabled={loadingVehicles} onClick={() => setAddingVehicle(true)}>+ Add Vehicle</Button>
          </>}
          {step === 2 && <>{validation.errors.services && <Alert severity="error" sx={{ mb: 2 }}>{validation.errors.services}</Alert>}<Typography component="h2" sx={{ fontSize: 18, fontWeight: 700, mb: 2 }}>Choose services</Typography><Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 1 }}>Select up to 20 services.</Typography>
            {!services.length ? <Alert severity="info">No active services are available.</Alert> : <Box sx={formWorkspaceGrid}>{services.map(item => <Paper key={item._id} component="button" type="button" onClick={() => toggleService(item._id)} aria-pressed={serviceIds.includes(item._id)} sx={{ ...choiceStyle, display: 'flex', gap: 1, alignItems: 'flex-start', borderColor: serviceIds.includes(item._id) ? 'primary.main' : 'var(--line)', bgcolor: serviceIds.includes(item._id) ? 'var(--accent-soft)' : 'var(--surface)' }}>{serviceIds.includes(item._id) ? <CheckCircleOutlined sx={{ color: 'primary.main' }} /> : <RadioButtonUncheckedOutlined sx={{ color: 'text.secondary' }} />}<Box><Typography sx={{ fontWeight: 650 }}>{item.name}</Typography><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{item.estimatedDuration} min · {money(item.estimatedPrice)}</Typography></Box></Paper>)}</Box>}
            {otherService && <Stack spacing={1} sx={{ mt: 2 }}><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Diagnostic estimate: {otherService.estimatedDuration} minutes. Final service duration will be confirmed after assessment.</Typography>
              <TextField label="Describe the issue or service needed" required multiline minRows={2} value={concern} error={concernError && !concern.trim()} helperText={concernError && !concern.trim() ? 'Describe the issue or service needed.' : ''} onChange={event => { setConcern(event.target.value); setConcernError(false) }} slotProps={{ htmlInput: { maxLength: 3000 } }} />
            </Stack>}
          </>}
          {step === 3 && <>{validation.errors.schedule && <Alert severity="error" sx={{ mb: 2 }}>{validation.errors.schedule}</Alert>}<Typography component="h2" sx={{ fontSize: 18, fontWeight: 700, mb: 2 }}>Choose Date &amp; Time</Typography>
            <BookingDateTimePicker serviceIds={serviceIds} selectedDate={selectedDate} selectedScheduleId={slot?.scheduleId} refreshKey={refresh} disabled={saving} defaultToday onChange={(date, value) => { setSelectedDate(date); setSlot(value) }} />
          </>}
          {step === 4 && <><Typography component="h2" sx={{ fontSize: 18, fontWeight: 700, mb: 2 }}>Review walk-in</Typography>
            <Stack spacing={2}><BookingRecordDetails business total={estimate} booking={{ client, vehicle, services: chosen, bookingType: 'walk-in', bookingDate: selectedDate, bookingTime: slot?.time, concern: otherService ? concern : '' }} /></Stack>
            <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 2 }}>Booking type: Walk-In. Created as Checked-In. Estimate uses current service prices.</Typography></>}
          <Stack direction="row" justifyContent="space-between" sx={{ mt: 4 }}><Button variant="outlined" disabled={step === 0 || saving} onClick={() => setStep(value => value - 1)}>Back</Button>{step < 4 ? <Button variant="contained" disabled={!canContinue || saving} onClick={continueStep}>Continue</Button> : <Button variant="contained" disabled={saving || !client || !vehicle || !slot || !chosen.length} onClick={submit}>{saving ? 'Creating…' : 'Create Walk-In booking'}</Button>}</Stack>
        </>}
    </FormWorkspace>}
    {addingVehicle && <WalkInVehicleDialog customer={client} onClose={() => setAddingVehicle(false)} onAdded={item => {
      setVehicles(current => [...current, item]); setVehicleId(item._id); setAddingVehicle(false)
    }} />}
  </>
}
