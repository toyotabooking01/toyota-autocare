import { useRef, useState } from 'react'
import { Alert, Box, Button, Checkbox, FormControlLabel, InputAdornment, MenuItem, Paper, Stack, Step, StepLabel, Stepper, TextField, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import api from '../services/api'
import useFormValidation from '../components/useFormValidation'
import { useConfirmation } from '../components/ConfirmationContext'
import { NAME_SUFFIXES, registrationNames, restrictMobileInput, normalizePlateInput } from '../../../shared/accountValidation.mjs'
import { money, dateLabel } from './bookingDisplay'
import BookingDateTimePicker from '../components/BookingDateTimePicker'

const grid = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }
const labels = { firstName: 'First Name', lastName: 'Last Name', middleName: 'Middle Name / Initial (optional)',
  email: 'Email', phone: 'Philippine Mobile Number', make: 'Make', model: 'Model', year: 'Year', plateNumber: 'Plate Number', currentMileage: 'Current mileage (optional)' }
export default function NewWalkInForm({ services = [], loading, refreshKey, onRefresh, onBusy, onComplete }) {
  const [customer, setCustomer] = useState({ firstName: '', lastName: '', middleName: '', suffix: '', email: '', phone: '' })
  const [vehicle, setVehicle] = useState({ make: '', model: '', year: '', plateNumber: '', transmission: '', currentMileage: '' })
  const [serviceIds, setServiceIds] = useState([])
  const [concern, setConcern] = useState('')
  const [concernError, setConcernError] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [slot, setSlot] = useState(null)
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [completed, setCompleted] = useState(null)
  const inFlight = useRef(false)
  const confirm = useConfirmation()
  const customerValidation = useFormValidation('walkInClient', customer)
  const vehicleValidation = useFormValidation('vehicle', vehicle)
  const validationSlots = slot ? [{ _id: slot.scheduleId, isEnabled: true, date: selectedDate, timeSlot: slot.time, maximumCapacity: 1, currentBookingCount: 0 }] : []
  const serviceOptions = Array.isArray(services) ? services : []
  const bookingValidation = useFormValidation('booking', { services: serviceIds, schedule: slot?.scheduleId || '' }, { skip: ['vehicle'], available: { services: serviceOptions, schedule: validationSlots } })
  const chosen = serviceOptions.filter(item => serviceIds.includes(item._id))
  const otherService = chosen.find(item => item.isOtherService)
  function checkVisit() {
    if (!bookingValidation.validate()) return false
    if (otherService && !concern.trim()) {
      setConcernError('Describe the issue or service needed.')
      return false
    }
    setConcernError('')
    if (chosen.length !== serviceIds.length || !slot) {
      setError('Choose available services and an appointment time.'); return false
    }
    return true
  }
  function checkAll() {
    if (!customerValidation.validate()) { setStep(0); return false }
    if (!vehicleValidation.validate()) { setStep(1); return false }
    if (!checkVisit()) { setStep(2); return false }
    return true
  }
  function next() {
    const valid = step === 0 ? customerValidation.validate() : step === 1 ? vehicleValidation.validate() : checkVisit()
    if (valid) { setError(''); setStep(step + 1) }
  }
  async function submit() {
    if (inFlight.current || !checkAll()) return
    await confirm('Are you sure you want to create this client account and confirm this service booking?', async () => {
      if (inFlight.current || !checkAll()) return
      inFlight.current = true; setBusy(true); onBusy(true); setError('')
      try {
        const { data } = await api.post('/bookings/walk-in/new-client', { customer, vehicle: { ...vehicle, year: Number(vehicle.year),
          ...(vehicle.currentMileage === '' ? { currentMileage: 0 } : { currentMileage: Number(vehicle.currentMileage) }) }, services: serviceIds, schedule: slot.scheduleId, concern })
        setCompleted(data); onComplete(data.item)
      } catch (requestError) {
        const status = requestError.response?.status
        const raw = requestError.response?.data?.errors || {}
        // Only display known, friendly field messages, never raw server details.
        const errors = Object.fromEntries(Object.keys(raw).filter(key => [...Object.keys(customer), ...Object.keys(vehicle), 'services', 'schedule'].includes(key)).map(key => [key,
          status === 409 && key === 'email' ? 'This email already has an account. Choose Existing Client instead.'
            : status === 409 && key === 'plateNumber' ? 'Plate number already exists.'
              : key === 'schedule' ? 'Choose another available schedule.' : `Please check ${labels[key] || key}.`]))
        const safe = { response: { data: { errors } } }
        customerValidation.receive(safe); vehicleValidation.receive(safe); bookingValidation.receive(safe)
        if (Object.keys(errors).some(key => key in customer)) setStep(0)
        else if (Object.keys(errors).some(key => key in vehicle)) setStep(1)
        else if (errors.services || errors.schedule) setStep(2)
        setError(Object.keys(errors).length ? '' : status === 503 ? 'Account email is unavailable. Please try again later.'
          : 'We could not confirm the result. Check Bookings and Existing Client before trying again.')
        if (errors.schedule || errors.services) { setSlot(null); onRefresh() }
      } finally { inFlight.current = false; setBusy(false); onBusy(false) }
    })
  }
  function field(key, isVehicle = false) {
    const values = isVehicle ? vehicle : customer
    const update = isVehicle ? setVehicle : setCustomer
    const validation = isVehicle ? vehicleValidation : customerValidation
    const maxLength = { firstName: 40, lastName: 40, middleName: 30, email: 254, phone: 13, make: 80, model: 80, plateNumber: 30 }[key]
    const isPlate = key === 'plateNumber'
    const isMileage = key === 'currentMileage'
    return <TextField key={key} fullWidth size="small" label={labels[key]} required={!['middleName', 'currentMileage'].includes(key)}
      type={['year', 'currentMileage'].includes(key) ? 'number' : key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'}
      value={values[key]} {...validation.field(key)} disabled={busy}
      slotProps={{ htmlInput: {
        ...(maxLength ? { maxLength } : {}),
        ...(isMileage ? { min: 0, max: 9999999, step: 1, inputMode: 'numeric' } : {}),
        ...(isPlate ? { style: { textTransform: 'uppercase' } } : {}),
      }, input: isMileage ? { endAdornment: <InputAdornment position="end">km</InputAdornment> } : undefined }}
      onKeyDown={isMileage ? event => {
        if (!event.ctrlKey && !event.metaKey && ['e', 'E', '+', '-', '.', ','].includes(event.key)) event.preventDefault()
      } : undefined}
      onPaste={isMileage ? event => {
        const pasted = event.clipboardData.getData('text').trim()
        if (!/^\d+$/.test(pasted)) event.preventDefault()
      } : undefined}
      onBlur={isPlate ? () => update(current => ({ ...current, plateNumber: normalizePlateInput(current.plateNumber, { trim: true }) })) : undefined}
      onChange={event => update(current => ({ ...current, [key]: key === 'phone' ? restrictMobileInput(event.target.value)
        : isPlate ? normalizePlateInput(event.target.value)
          : isMileage ? (/^\d*$/.test(event.target.value) ? event.target.value : current[key])
            : event.target.value }))} />
  }
  return <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, maxWidth: 960, borderRadius: 2.5 }}>
    {completed ? <Stack spacing={2}>
      <Alert severity={completed.emailSent ? 'success' : 'warning'}>{completed.message}</Alert>
      <Typography>Booking reference: {completed.item._id}</Typography>
      <Typography>Created as Confirmed. Check-In remains a separate action.</Typography>
      <Button component={Link} to="/admin/bookings">View bookings</Button>
    </Stack> : <Stack spacing={3}>
      <Stepper activeStep={step} alternativeLabel>{['Client', 'Vehicle', 'Date & Time', 'Review'].map(label => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}</Stepper>
      {error && <Alert severity="error">{error}</Alert>}
      {step === 0 && <><Alert severity="info">The client will receive a temporary password by email and must change it after signing in.</Alert>
        <Box sx={grid}>{field('firstName')}{field('lastName')}{field('middleName')}
          <TextField select size="small" label="Suffix (optional)" value={customer.suffix} {...customerValidation.field('suffix')} disabled={busy}
            onChange={event => setCustomer({ ...customer, suffix: event.target.value })}>
            {NAME_SUFFIXES.map(value => <MenuItem key={value} value={value}>{value || 'None'}</MenuItem>)}
          </TextField>{field('email')}{field('phone')}</Box></>}
      {step === 1 && <Box sx={grid}>{['make', 'model', 'year', 'plateNumber'].map(key => field(key, true))}
        <TextField select required size="small" label="Transmission" value={vehicle.transmission} {...vehicleValidation.field('transmission')} disabled={busy}
          onChange={event => setVehicle({ ...vehicle, transmission: event.target.value })}>
          {['manual', 'automatic', 'cvt'].map(value => <MenuItem key={value} value={value}>{value === 'cvt' ? 'CVT' : value[0].toUpperCase() + value.slice(1)}</MenuItem>)}
        </TextField>{field('currentMileage', true)}</Box>}
      {step === 2 && <>
        <Typography component="h2" variant="h6">Services and schedule</Typography>
        {loading && <Alert severity="info">Loading available visits…</Alert>}
        {!loading && !services.length && <Alert severity="info">No active services are available.</Alert>}
        {bookingValidation.errors.services && <Alert severity="error">{bookingValidation.errors.services}</Alert>}
        <Box sx={grid}>{serviceOptions.map(item => <FormControlLabel key={item._id} control={<Checkbox checked={serviceIds.includes(item._id)}
          disabled={busy || (!serviceIds.includes(item._id) && serviceIds.length >= 20)} onChange={(_, checked) => { setServiceIds(current => checked ? [...current, item._id] : current.filter(id => id !== item._id)); setSlot(null) }} />}
          label={`${item.name} · ${money(item.estimatedPrice)}`} />)}</Box>
        {otherService && <Stack spacing={1}>
          <TextField required fullWidth multiline minRows={2} label="Describe the issue or service needed" value={concern}
            error={Boolean(concernError)} helperText={concernError} disabled={busy} slotProps={{ htmlInput: { maxLength: 2000 } }}
            onChange={event => { setConcern(event.target.value); if (event.target.value.trim()) setConcernError('') }} />
          <Alert severity="info">Diagnostic estimate: {otherService.estimatedDuration} minutes. Final service duration will be confirmed after assessment.</Alert>
        </Stack>}
        <BookingDateTimePicker serviceIds={serviceIds} selectedDate={selectedDate} selectedScheduleId={slot?.scheduleId} refreshKey={refreshKey} disabled={busy || loading}
          onChange={(date, value) => { setSelectedDate(date); setSlot(value) }} />
        {bookingValidation.errors.schedule && <Alert severity="error">{bookingValidation.errors.schedule}</Alert>}
      </>}
      {step === 3 && <Stack spacing={1}>
        <Typography variant="h6">Review new client and visit</Typography>
        <Typography>{registrationNames(customer).fullName}</Typography><Typography>{customer.email} · {customer.phone}</Typography>
        <Typography>{vehicle.make} {vehicle.model} {vehicle.year} · {vehicle.plateNumber} · {vehicle.transmission}</Typography>
        <Typography>{chosen.map(item => item.name).join(', ')}</Typography>
        {otherService && <Typography>Issue: {concern.trim()}</Typography>}
        <Typography>{slot && `${dateLabel(selectedDate)} · ${slot.time}`}</Typography>
        <Typography>Estimated total: {money(chosen.reduce((total, item) => total + Number(item.estimatedPrice || 0), 0))}</Typography>
        <Alert severity="info">Creates a Client account, its vehicle, and a Confirmed Walk-In booking. Temporary sign-in details will be emailed to the client.</Alert>
      </Stack>}
      <Stack direction="row" justifyContent="space-between"><Button disabled={busy || step === 0} onClick={() => setStep(step - 1)}>Back</Button>
        {step < 3 ? <Button variant="contained" disabled={busy || loading} onClick={next}>Continue</Button>
          : <Button variant="contained" disabled={busy} onClick={submit}>{busy ? 'Creating…' : 'Create client and booking'}</Button>}
      </Stack>
    </Stack>}
  </Paper>
}
