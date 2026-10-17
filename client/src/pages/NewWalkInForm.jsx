import BookingRecordDetails from '../components/BookingRecordDetails'
import FormWorkspace from '../components/FormWorkspace'
import { formWorkspaceGrid } from '../layouts/workspaceDimensions'
import { useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, Checkbox, FormControlLabel, MenuItem, Stack, Step, StepLabel, Stepper, TextField, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import api from '../services/api'
import useFormValidation from '../components/useFormValidation'
import { useConfirmation } from '../components/ConfirmationContext'
import { NAME_SUFFIXES, restrictMobileInput, normalizePlateInput } from '../../../shared/accountValidation.mjs'
import { money } from './bookingDisplay'
import BookingDateTimePicker from '../components/BookingDateTimePicker'
import ToyotaVehiclePicker from '../components/ToyotaVehiclePicker'
import useToyotaCatalog from '../hooks/useToyotaCatalog'
import MileageInput from '../components/MileageInput'
import { validateForm } from '../utils/validationRules'

const grid = formWorkspaceGrid
const labels = { firstName: 'First Name', lastName: 'Last Name', middleName: 'Middle Name / Initial (optional)',
  email: 'Email Address', phone: 'Philippine Mobile Number', address: 'Address (optional)', make: 'Make', model: 'Model', year: 'Year', variant: 'Variant', plateNumber: 'Plate Number', currentMileage: 'Current mileage (optional)' }
export default function NewWalkInForm({ role = 'staff', embedded = false, services = [], loading, refreshKey, onRefresh, onBusy, onComplete, onFooterActionChange }) {
  const [customer, setCustomer] = useState({ firstName: '', lastName: '', middleName: '', suffix: '', email: '', phone: '', address: '' })
  const [vehicle, setVehicle] = useState({ make: 'Toyota', model: '', year: '', variant: '', plateNumber: '', transmission: '', currentMileage: '' })
  const catalog = useToyotaCatalog()
  const [serviceIds, setServiceIds] = useState([])
  const [concern, setConcern] = useState('')
  const [concernError, setConcernError] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [slot, setSlot] = useState(null)
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [completed, setCompleted] = useState(null)
  const [linkedAccount, setLinkedAccount] = useState(null)
  const [accountDelivery, setAccountDelivery] = useState(null)
  const [accountBusy, setAccountBusy] = useState(false)
  const [emailCheck, setEmailCheck] = useState({ email: '', status: 'idle', message: '' })
  const inFlight = useRef(false)
  const confirm = useConfirmation()
  const customerValidation = useFormValidation('walkInClient', customer)
  const vehicleValidation = useFormValidation('vehicle', vehicle)
  const validationSlots = slot ? [{ _id: slot.scheduleId, isEnabled: true, date: selectedDate, timeSlot: slot.time, maximumCapacity: 1, currentBookingCount: 0 }] : []
  const serviceOptions = Array.isArray(services) ? services : []
  const bookingValidation = useFormValidation('booking', { services: serviceIds, schedule: slot?.scheduleId || '' }, { skip: ['vehicle'], available: { services: serviceOptions, schedule: validationSlots } })
  const chosen = serviceOptions.filter(item => serviceIds.includes(item._id))
  const otherService = chosen.find(item => item.isOtherService)
  const normalizedEmail = customer.email.trim().toLowerCase()
  const clientAccountLinked = Boolean(linkedAccount && linkedAccount.email === normalizedEmail)
  useEffect(() => {
    if (!normalizedEmail || validateForm('email', { email: normalizedEmail }).email || completed || clientAccountLinked) return undefined
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setEmailCheck({ email: normalizedEmail, status: 'checking', message: '' })
      try {
        const { data } = await api.get('/bookings/walk-in/email-check', { params: { email: normalizedEmail }, signal: controller.signal })
        if (!controller.signal.aborted) setEmailCheck({ email: normalizedEmail,
          status: data.existingClient ? 'existing' : 'new', account: data.account, message: data.message || '' })
      } catch (error) {
        if (!controller.signal.aborted) setEmailCheck({ email: normalizedEmail, status: 'error',
          message: error.response?.data?.errors?.email || 'Email could not be checked. Please retry.' })
      }
    }, 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [normalizedEmail, completed, clientAccountLinked])
  async function createAccount() {
    if (accountBusy || !customerValidation.validate() || emailCheck.email !== normalizedEmail || emailCheck.status !== 'new') return
    setAccountBusy(true); setError(''); onBusy(true)
    try {
      const { data } = await api.post('/bookings/walk-in/client-account', { ...customer, email: normalizedEmail })
      setLinkedAccount(data.account)
      setAccountDelivery(data.accountCreated ? { token: data.deliveryToken, emailSent: data.emailSent === true } : null)
    } catch (requestError) {
      customerValidation.receive(requestError)
      setError(requestError.response?.data?.errors ? '' : 'Client account could not be created. Please retry.')
    } finally { setAccountBusy(false); onBusy(false) }
  }
  async function retryCredentials() {
    if (accountBusy || !clientAccountLinked || !accountDelivery?.token) return
    setAccountBusy(true); setError(''); onBusy(true)
    try {
      const { data } = await api.post(`/bookings/walk-in/clients/${linkedAccount.id}/resend-credentials`, { deliveryToken: accountDelivery.token })
      setAccountDelivery(current => ({ ...current, emailSent: data.emailSent === true }))
    } catch { setError('Credentials could not be resent right now. Please retry later.') }
    finally { setAccountBusy(false); onBusy(false) }
  }
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
    if (!clientAccountLinked) { setStep(0); setError('Link or create a Client account before continuing.'); return false }
    if (!vehicleValidation.validate()) { setStep(1); return false }
    if (!checkVisit()) { setStep(2); return false }
    return true
  }
  function next() {
    const valid = step === 0 ? clientAccountLinked : step === 1 ? vehicleValidation.validate() : checkVisit()
    if (valid) { setError(''); setStep(step + 1) }
  }
  async function submit() {
    if (inFlight.current || !checkAll()) return
    await confirm('Create this walk-in service booking?', async () => {
      if (inFlight.current || !checkAll()) return
      inFlight.current = true; setBusy(true); onBusy(true); setError('')
      try {
        const { data } = await api.post('/bookings/walk-in/visit', { client: linkedAccount.id, vehicle: { ...vehicle, variant: vehicle.variant.trim(), year: Number(vehicle.year),
          ...(vehicle.currentMileage === '' ? { currentMileage: 0 } : { currentMileage: Number(vehicle.currentMileage) }) }, services: serviceIds, schedule: slot.scheduleId, concern })
        setCompleted(data); onComplete(data.item)
      } catch (requestError) {
        const status = requestError.response?.status
        const raw = requestError.response?.data?.errors || {}
        // Only display known, friendly field messages, never raw server details.
        const errors = Object.fromEntries(Object.keys(raw).filter(key => ['client', ...Object.keys(vehicle), 'services', 'schedule'].includes(key)).map(key => [key,
          status === 409 && key === 'email' ? 'This email could not be linked. Check Existing Customer before trying again.'
            : status === 409 && key === 'plateNumber' ? 'This plate number is already registered.'
              : key === 'schedule' ? 'Choose another available schedule.' : `Please check ${labels[key] || key}.`]))
        const safe = { response: { data: { errors } } }
        customerValidation.receive(safe); vehicleValidation.receive(safe); bookingValidation.receive(safe)
        if (errors.client) setStep(0)
        else if (Object.keys(errors).some(key => key in vehicle)) setStep(1)
        else if (errors.services || errors.schedule) setStep(2)
        setError(Object.keys(errors).length ? '' : 'We could not confirm the result. Check Bookings and Existing Customer before trying again.')
        if (errors.schedule || errors.services) { setSlot(null); onRefresh() }
      } finally { inFlight.current = false; setBusy(false); onBusy(false) }
    })
  }
  const submitRef = useRef(submit)
  const nextRef = useRef(next)
  useEffect(() => { submitRef.current = submit })
  useEffect(() => { nextRef.current = next })
  useEffect(() => {
    if (!embedded || completed) {
      onFooterActionChange?.(null)
      return undefined
    }
    onFooterActionChange?.({
      showBack: step > 0,
      onBack: () => setStep(value => Math.max(0, value - 1)),
      primaryLabel: step === 3 ? 'Create Booking' : 'Continue',
      disabled: busy || accountBusy || loading || (step === 0 && !clientAccountLinked),
      onClick: () => step === 3 ? submitRef.current() : nextRef.current(),
    })
    return () => onFooterActionChange?.(null)
  }, [embedded, step, completed, busy, accountBusy, loading, clientAccountLinked, onFooterActionChange])
  function field(key, isVehicle = false) {
    const values = isVehicle ? vehicle : customer
    const update = isVehicle ? setVehicle : setCustomer
    const validation = isVehicle ? vehicleValidation : customerValidation
    const maxLength = { firstName: 40, lastName: 40, middleName: 30, email: 254, phone: 13, address: 300, make: 80, model: 80, plateNumber: 8 }[key]
    const isPlate = key === 'plateNumber'
    return <TextField key={key} className={key === 'address' ? 'walk-in-address-field' : undefined} fullWidth size="small" label={labels[key]} required={!['middleName', 'address', 'currentMileage'].includes(key)}
      type={key === 'year' ? 'number' : key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'}
      value={values[key]} {...validation.field(key, key === 'email' ? 'If this email is not yet registered, a Client account will be created and temporary login credentials will be sent to this address.' : undefined)} disabled={busy || accountBusy || (!isVehicle && clientAccountLinked)}
      slotProps={{ htmlInput: {
        ...(maxLength ? { maxLength } : {}),
        ...(isPlate ? { style: { textTransform: 'uppercase' } } : {}),
      } }}
      onBlur={key === 'email' ? () => setCustomer(current => ({ ...current, email: current.email.trim().toLowerCase() }))
        : isPlate ? () => update(current => ({ ...current, plateNumber: normalizePlateInput(current.plateNumber, { trim: true }) })) : undefined}
      onChange={event => update(current => ({ ...current, [key]: key === 'phone' ? restrictMobileInput(event.target.value)
        : isPlate ? normalizePlateInput(event.target.value) : event.target.value }))} />
  }
  return <><FormWorkspace>
    {completed ? <Stack spacing={2}>
      <Alert severity="success">Walk-in booking created successfully. The customer is checked in.</Alert>
      <Typography role="status" sx={{ fontSize: 13, color: 'text.secondary' }}>Client account: {linkedAccount?.fullName} · {linkedAccount?.email}</Typography>
      <Typography>Booking reference: {completed.item._id}</Typography>
      <Stack direction="row" spacing={1}><Button component={Link} to={`/${role}/bookings?open=${completed.item._id}`}>View Booking</Button><Button component={Link} to={`/${role}/job-orders`}>Continue to Job Coordination</Button></Stack>
    </Stack> : <Stack spacing={3}>
      <Stepper activeStep={step} alternativeLabel sx={{ mb: embedded ? 1 : 0 }}>{['Customer / Client Account', 'Vehicle', 'Services & Time', 'Review'].map(label => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}</Stepper>
      {error && <Alert severity="error">{error}</Alert>}
      {step === 0 && <><Alert severity="info">A Client account is required. Enter an email to link or create one.</Alert>
        <Box sx={grid}>{field('firstName')}{field('lastName')}{field('middleName')}
          <TextField select size="small" label="Suffix (optional)" value={customer.suffix} {...customerValidation.field('suffix')} disabled={busy || accountBusy || clientAccountLinked}
            onChange={event => setCustomer({ ...customer, suffix: event.target.value })}>
            {NAME_SUFFIXES.map(value => <MenuItem key={value} value={value}>{value || 'None'}</MenuItem>)}
          </TextField>{field('email')}{field('phone')}{field('address')}</Box>
        {clientAccountLinked ? <Stack spacing={1}>
          <Alert severity={accountDelivery && !accountDelivery.emailSent ? 'warning' : 'success'}>{accountDelivery
            ? accountDelivery.emailSent ? 'Client account created. Login credentials were sent to the customer’s email.'
              : 'Client account was created, but login credentials could not be emailed.'
            : 'Existing Client account found and linked.'}</Alert>
          <Typography sx={{ fontSize: 13 }}>Customer: {linkedAccount.fullName} · Email: {linkedAccount.email}</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {accountDelivery && !accountDelivery.emailSent && <Button variant="outlined" disabled={accountBusy} onClick={retryCredentials}>Retry sending credentials</Button>}
            <Button size="small" disabled={accountBusy} onClick={() => { setLinkedAccount(null); setAccountDelivery(null) }}>Change customer</Button>
          </Stack>
        </Stack> : emailCheck.email === normalizedEmail && emailCheck.status === 'existing' ? <Stack spacing={1}>
          <Alert severity="success">Existing Client account found</Alert>
          <Typography sx={{ fontSize: 13 }}>Client: {emailCheck.account?.fullName} · Email: {emailCheck.account?.email}</Typography>
          <Button variant="outlined" disabled={accountBusy} onClick={() => { if (customerValidation.validate()) setLinkedAccount(emailCheck.account) }}>Use this Client account</Button>
        </Stack> : emailCheck.email === normalizedEmail && emailCheck.status === 'new' ? <Stack spacing={1}>
          {emailCheck.message && <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{emailCheck.message}</Typography>}
          <Button variant="contained" disabled={accountBusy} onClick={createAccount}>{accountBusy ? 'Creating account…' : 'Create Client account'}</Button>
        </Stack> : emailCheck.email === normalizedEmail && emailCheck.message && <Typography role="status" sx={{ fontSize: 13, color: 'text.secondary' }}>{emailCheck.message}</Typography>}
      </>}
      {step === 1 && <Stack spacing={2}>
        <ToyotaVehiclePicker value={vehicle} onChange={changes => setVehicle(current => ({ ...current, ...changes }))}
          validation={vehicleValidation} catalog={catalog} busy={busy} size="small">
        <Box sx={grid}>{field('plateNumber', true)}<MileageInput label="Current mileage (optional)" optional size="small"
          disabled={busy} value={vehicle.currentMileage} {...vehicleValidation.field('currentMileage')}
          onValueChange={value => setVehicle(current => ({ ...current, currentMileage: value }))} /></Box>
        </ToyotaVehiclePicker>
      </Stack>}
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
        <BookingDateTimePicker serviceIds={serviceIds} selectedDate={selectedDate} selectedScheduleId={slot?.scheduleId} refreshKey={refreshKey} disabled={busy || loading} defaultToday
          onChange={(date, value) => { setSelectedDate(date); setSlot(value) }} />
        {bookingValidation.errors.schedule && <Alert severity="error">{bookingValidation.errors.schedule}</Alert>}
      </>}
      {step === 3 && <Stack spacing={2}>
        <Typography variant="h6">Review walk-in customer and visit</Typography>
        <BookingRecordDetails business booking={{ client: { ...customer, fullName: linkedAccount.fullName, email: linkedAccount.email }, vehicle, services: chosen,
          bookingType: 'walk-in', bookingDate: selectedDate, bookingTime: slot?.time, concern: otherService ? concern.trim() : '' }} />
        <Alert severity="info">Creates a vehicle and Checked-In booking for the linked Client account.</Alert>
      </Stack>}
      {!embedded && <Stack direction="row" justifyContent="space-between" sx={{ mt: 2 }}>{step > 0 ? <Button disabled={busy} onClick={() => setStep(value => value - 1)}>Back</Button> : <Box />}
        {step < 3 ? <Button variant="contained" disabled={busy || accountBusy || loading || (step === 0 && !clientAccountLinked)} onClick={next}>Continue</Button>
          : <Button variant="contained" disabled={busy} onClick={submit}>{busy ? 'Creating…' : 'Create Walk-In Booking'}</Button>}
      </Stack>}
    </Stack>}
  </FormWorkspace>
  </>
}
