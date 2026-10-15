import BookingRecordDetails from '../components/BookingRecordDetails'
import FormWorkspace from '../components/FormWorkspace'
import { formWorkspaceGrid } from '../layouts/workspaceDimensions'
import { useConfirmation } from '../components/ConfirmationContext'
import useFormValidation from '../components/useFormValidation'
import { useEffect, useState } from 'react'
import { Alert, Box, Button, CircularProgress, Paper, Stack, Step, StepLabel, Stepper, TextField, Typography } from '@mui/material'
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined'
import RadioButtonUncheckedOutlined from '@mui/icons-material/RadioButtonUncheckedOutlined'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../services/api'
import { PageHeading } from '../components/DashboardParts'
import { money } from './bookingDisplay'
import { message } from './useCatalog'
import BookingDateTimePicker from '../components/BookingDateTimePicker'
import PaymentPanel from '../components/PaymentPanel'
import { formatPaymentMethod } from '../utils/paymentMethod'

const steps = ['Vehicle', 'Services', 'Date & Time', 'Review', 'Downpayment', 'Confirmation']
const card = { p: 2, border: '1px solid var(--line)', borderRadius: 2, cursor: 'pointer', minWidth: 0 }
const bookingStepperSx = { mb: 4, display: { xs: 'none', sm: 'flex' },
  '& .MuiStepIcon-root': { color: 'text.disabled' },
  '& .MuiStepIcon-root.Mui-completed': { color: 'var(--blue-done)' },
  '& .MuiStepIcon-root.Mui-active': { color: 'var(--blue-active)' },
  '& .MuiStepLabel-label': { color: 'text.secondary' },
  '& .MuiStepLabel-label.Mui-active': { color: 'text.primary', fontWeight: 700 },
  '& .MuiStepLabel-label.Mui-completed': { color: 'text.secondary' },
  '& .MuiStepConnector-line': { borderColor: 'divider' },
}
const flowPrimaryButtonSx = { bgcolor: 'var(--action)', color: 'var(--action-ink)', '&:hover': { bgcolor: 'var(--action-hover)' },
  '&.Mui-disabled': { bgcolor: 'action.disabledBackground', color: 'text.disabled' } }
const flowBackButtonSx = { color: 'var(--ink)', borderColor: 'var(--line-strong)', '&:hover': { borderColor: 'var(--ink)', bgcolor: 'var(--surface-soft)' } }
export default function ClientBookService() {
  const [searchParams] = useSearchParams()
  const suggestedVehicle = searchParams.get('vehicle')
  const suggestedService = searchParams.get('service')
  const confirm = useConfirmation()
  const [vehicles, setVehicles] = useState([])
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [optionsError, setOptionsError] = useState(false)
  const [notice, setNotice] = useState('')
  const [step, setStep] = useState(0)
  const [vehicleId, setVehicleId] = useState('')
  const [activeServiceIds, setActiveServiceIds] = useState([])
  const [activeServicesLoading, setActiveServicesLoading] = useState(false)
  const [activeServicesError, setActiveServicesError] = useState(false)
  const [activeServicesRefresh, setActiveServicesRefresh] = useState(0)
  const [duplicateNotice, setDuplicateNotice] = useState('')
  const [serviceIds, setServiceIds] = useState([])
  const [concern, setConcern] = useState('')
  const [concernError, setConcernError] = useState(false)
  const [selectedDate, setSelectedDate] = useState('')
  const [slot, setSlot] = useState(null)
  const validationSlots = slot ? [{ _id: slot.scheduleId, isEnabled: true, date: selectedDate, timeSlot: slot.time, maximumCapacity: 1, currentBookingCount: 0 }] : []
  const validation = useFormValidation('booking', { vehicle: vehicleId, services: serviceIds, schedule: slot?.scheduleId || '' }, { available: { vehicle: vehicles, services, schedule: validationSlots } })
  const [saving, setSaving] = useState(false)
  const [provisional, setProvisional] = useState(null)
  const [paymentSummary, setPaymentSummary] = useState(null)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      api.get('/vehicles', { params: { archive: 'active' }, signal: controller.signal }),
      api.get('/bookings/options', { signal: controller.signal }),
    ]).then(([vehicleResponse, optionResponse]) => {
      setVehicles(vehicleResponse.data.items)
      setServices(optionResponse.data.services)
      if (suggestedVehicle && vehicleResponse.data.items.some(item => item._id === suggestedVehicle)) setVehicleId(current => current || suggestedVehicle)
      if (suggestedService && optionResponse.data.services.some(item => item._id === suggestedService)) setServiceIds(current => current.length ? current : [suggestedService])
      setServiceIds(current => current.filter(id => optionResponse.data.services.some(item => item._id === id)))
      setOptionsError(false)
      setError('')
    }).catch(requestError => { if (!controller.signal.aborted) {
      setVehicles([]); setServices([]); setOptionsError(true); setError(message(requestError))
    } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [refresh, suggestedVehicle, suggestedService])
  useEffect(() => {
    if (!vehicleId) return undefined
    const controller = new AbortController()
    queueMicrotask(() => { if (!controller.signal.aborted) setActiveServicesLoading(true) })
    api.get('/bookings/active-services', { params: { vehicle: vehicleId }, signal: controller.signal })
      .then(response => {
        const booked = response.data.serviceIds || []
        setActiveServiceIds(booked)
        setServiceIds(current => current.filter(id => !booked.includes(id)))
      })
      .catch(requestError => { if (!controller.signal.aborted) { setActiveServiceIds([]); setActiveServicesError(true); setError(message(requestError)) } })
      .finally(() => { if (!controller.signal.aborted) setActiveServicesLoading(false) })
    return () => controller.abort()
  }, [vehicleId, activeServicesRefresh])
  const vehicle = vehicles.find(item => item._id === vehicleId)
  const chosen = services.filter(item => serviceIds.includes(item._id))
  const otherService = chosen.find(item => item.isOtherService)
  const estimate = chosen.reduce((sum, item) => sum + Number(item.estimatedPrice || 0), 0)
  const canContinue = [Boolean(vehicle), !activeServicesLoading && !activeServicesError && chosen.length > 0, Boolean(slot), true][step]
  function toggleService(serviceId) {
    setServiceIds(current => current.includes(serviceId) ? current.filter(id => id !== serviceId) : current.length < 20 ? [...current, serviceId] : current)
    setSlot(null)
  }
  function continueStep() {
    if (step === 1 && otherService && !concern.trim()) { setConcernError(true); return }
    setConcernError(false); setStep(value => value + 1)
  }
  async function submit() {
    if (saving) return
    if (otherService && !concern.trim()) { setConcernError(true); setStep(1); return }
    if (!validation.validate()) { setStep(({ vehicle: 0, services: 1, schedule: 2 })[validation.firstError()] ?? 0); return }
    return confirm('Proceed to downpayment and hold this schedule for 15 minutes?', async () => {
      if (!validation.validate()) { setStep(({ vehicle: 0, services: 1, schedule: 2 })[validation.firstError()] ?? 0); return }
      setSaving(true); setError('')
      try {
        const response = await api.post('/bookings', { vehicle: vehicleId, services: serviceIds, schedule: slot.scheduleId, concern })
        setProvisional(response.data.item)
        setStep(4)
        setNotice('Your temporary schedule hold is active for 15 minutes.')
      } catch (requestError) {
        validation.receive(requestError)
        const fields = requestError.response?.data?.errors || {}
        const duplicateIds = fields.duplicateServiceIds
        if (Array.isArray(duplicateIds) && duplicateIds.length) {
          setActiveServiceIds(current => [...new Set([...current, ...duplicateIds])])
          setServiceIds(current => current.filter(id => !duplicateIds.includes(id)))
          setDuplicateNotice('One or more selected services already have an active booking for this vehicle. Choose another service.')
          setActiveServicesRefresh(value => value + 1)
          setSlot(null); setStep(1); setError('')
          return
        }
        if (fields.client) setStep(0)
        else if (fields.vehicle) setStep(0)
        else if (fields.services) setStep(1)
        else if (fields.schedule) setStep(2)
        setError(Object.keys(fields).length ? '' : message(requestError))
        if (requestError.response?.status === 409) { setSlot(null); setStep(2); setRefresh(value => value + 1) }
        else if (requestError.response?.status === 400) setRefresh(value => value + 1)
      } finally { setSaving(false) }
    })
  }
  async function editBooking() {
    if (!provisional || saving) return
    setSaving(true); setError('')
    try {
      await api.post(`/bookings/${provisional._id}/cancel`)
      setProvisional(null); setPaymentSummary(null); setStep(3)
      setNotice('Temporary hold released. You can edit your booking.')
      setActiveServicesRefresh(value => value + 1); setRefresh(value => value + 1)
    } catch (requestError) {
      if (requestError.response?.status === 409) {
        try {
          const response = await api.get(`/bookings/${provisional._id}`)
          if (response.data.item?.status === 'cancelled') {
            setProvisional(null); setPaymentSummary(null); setStep(2); setSlot(null); setRefresh(value => value + 1)
            setNotice('The temporary hold expired. Select another schedule.')
            return
          }
        } catch { /* Keep the original cancellation error. */ }
      }
      setError(message(requestError))
    } finally { setSaving(false) }
  }
  return <>
    <PageHeading title="Book a service" subtitle="Select your Toyota, services, and a time that works for you." preview={false} />
    {notice && <Alert severity="success" sx={{ mb: 2 }}>{notice}</Alert>}
    {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
    <FormWorkspace>
      {loading ? <Stack alignItems="center" sx={{ py: 8 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 1 }}>Loading booking options…</Typography></Stack>
        : optionsError ? <Stack alignItems="flex-start" spacing={2} sx={{ py: 5 }}><Typography sx={{ color: 'text.secondary', fontSize: 13 }}>Booking options could not be loaded.</Typography><Button variant="outlined" onClick={() => { setError(''); setOptionsError(false); setLoading(true); setRefresh(value => value + 1) }}>Retry loading</Button></Stack>
        : <>
            <Stepper activeStep={step} alternativeLabel sx={bookingStepperSx}>{steps.map(label => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}</Stepper>
            <Typography sx={{ display: { sm: 'none' }, fontSize: 12, color: 'text.secondary', mb: 2 }}>Step {step + 1} of 6 · {steps[step]}</Typography>
            {step === 0 && <>{validation.errors.vehicle && <Alert severity="error" sx={{ mb: 2 }}>{validation.errors.vehicle}</Alert>}<Typography component="h2" sx={{ fontSize: 18, fontWeight: 700, mb: 2 }}>Choose your vehicle</Typography>
              {!vehicles.length ? <Alert severity="info">Add a vehicle in My Vehicles before booking.</Alert> : <Box sx={formWorkspaceGrid}>{vehicles.map(item => <Paper key={item._id} component="button" type="button" onClick={() => { setVehicleId(item._id); setSlot(null); setSelectedDate(''); setDuplicateNotice('') }} aria-pressed={vehicleId === item._id} variant="outlined" sx={{ ...card, textAlign: 'left', borderColor: vehicleId === item._id ? 'var(--blue-ink)' : 'var(--line)', bgcolor: vehicleId === item._id ? 'var(--blue-soft)' : 'var(--surface)', '&:hover': { borderColor: 'var(--blue-ink)', bgcolor: 'var(--blue-soft)' } }}><Typography sx={{ fontWeight: 650 }}>{item.make} {item.model} {item.year}</Typography><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{item.plateNumber}</Typography></Paper>)}</Box>}
            </>}
            {step === 1 && <>{validation.errors.services && <Alert severity="error" sx={{ mb: 2 }}>{validation.errors.services}</Alert>}{duplicateNotice && <Alert severity="warning" onClose={() => setDuplicateNotice('')} sx={{ mb: 2 }}>{duplicateNotice}</Alert>}<Typography component="h2" sx={{ fontSize: 18, fontWeight: 700, mb: .5 }}>Choose services</Typography><Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 1 }}>Select up to 20 services.</Typography><Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 2 }}>You can select more than one.</Typography>
              {!vehicleId && <Alert severity="info" sx={{ mb: 2 }}>Choose a vehicle first to check its active bookings.</Alert>}
              {activeServicesLoading && <Alert severity="info" sx={{ mb: 2 }}>Checking this vehicle’s active bookings…</Alert>}
              {activeServicesError && <Alert severity="warning" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={() => setActiveServicesRefresh(value => value + 1)}>Retry</Button>}>Could not check active bookings. Services are unavailable until the check is complete.</Alert>}
              {!services.length ? <Alert severity="info">No services are currently available.</Alert> : <Box sx={formWorkspaceGrid}>{services.map(item => {
                const alreadyBooked = activeServiceIds.includes(item._id)
                const optionDisabled = !vehicleId || activeServicesLoading || activeServicesError || alreadyBooked
                return <Paper key={item._id} component="button" type="button" disabled={optionDisabled} onClick={() => toggleService(item._id)} aria-pressed={serviceIds.includes(item._id)} aria-disabled={optionDisabled} variant="outlined" sx={{ ...card, opacity: alreadyBooked ? .72 : optionDisabled ? .55 : 1, textAlign: 'left', display: 'flex', gap: 1, alignItems: 'flex-start', borderColor: serviceIds.includes(item._id) ? 'var(--blue-ink)' : 'var(--line)', bgcolor: serviceIds.includes(item._id) ? 'var(--blue-soft)' : 'var(--surface)', '&:hover': { borderColor: 'var(--blue-ink)', bgcolor: 'var(--blue-soft)' }, '&.Mui-disabled': { color: 'text.disabled' } }}>
                  {serviceIds.includes(item._id) ? <CheckCircleOutlined sx={{ color: 'var(--blue-ink)' }} /> : <RadioButtonUncheckedOutlined sx={{ color: 'text.secondary' }} />}
                  <Box sx={{ minWidth: 0 }}><Typography sx={{ fontWeight: 650 }}>{item.name}</Typography><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{item.estimatedDuration} min · {money(item.estimatedPrice)}</Typography>{alreadyBooked && <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: .5 }}>Already booked</Typography>}{item.description && <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: .5 }}>{item.description}</Typography>}</Box>
                </Paper>
              })}</Box>}
              {otherService && <Stack spacing={1} sx={{ mt: 2 }}><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Diagnostic estimate: {otherService.estimatedDuration} minutes. Final service duration will be confirmed after assessment.</Typography>
                <TextField label="Describe the issue or service needed" required multiline minRows={2} value={concern} error={concernError && !concern.trim()} helperText={concernError && !concern.trim() ? 'Describe the issue or service needed.' : ''} onChange={event => { setConcern(event.target.value); setConcernError(false) }} slotProps={{ htmlInput: { maxLength: 3000 } }} />
              </Stack>}
            </>}
            {step === 2 && <>{validation.errors.schedule && <Alert severity="error" sx={{ mb: 2 }}>{validation.errors.schedule}</Alert>}<Typography component="h2" sx={{ fontSize: 18, fontWeight: 700, mb: 2 }}>Choose Date &amp; Time</Typography>
              <BookingDateTimePicker serviceIds={serviceIds} selectedDate={selectedDate} selectedScheduleId={slot?.scheduleId} refreshKey={refresh} onChange={(date, value) => { setSelectedDate(date); setSlot(value) }} />
            </>}
            {step === 3 && <><Typography component="h2" sx={{ fontSize: 18, fontWeight: 700, mb: 2 }}>Review your booking</Typography>
              <Stack spacing={2}><BookingRecordDetails total={estimate} booking={{ vehicle, services: chosen, bookingDate: selectedDate, bookingTime: slot?.time, concern: otherService ? concern : '' }} /></Stack>
              <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 2 }}>The final estimate and exact 50% downpayment will be calculated from current service prices when you proceed.</Typography></>}
            {step === 4 && provisional && <Stack spacing={2}>
              <Typography component="h2" sx={{ fontSize: 18, fontWeight: 700 }}>Downpayment</Typography>
              <Typography sx={{ fontSize: 13 }}>Booking Summary · {vehicle?.make} {vehicle?.model} · {selectedDate} {slot?.time}</Typography>
              <PaymentPanel bookingId={provisional._id} bookingStatus={provisional.status} role="client"
                onSummary={setPaymentSummary} onHoldExpired={editBooking}
                onPaymentSubmitted={summary => { setPaymentSummary(summary); setStep(5); setNotice('Downpayment submitted for verification.') }} />
              <Button variant="text" disabled={saving || paymentSummary?.holdStatus === 'payment_submitted'} onClick={editBooking}>Edit booking and release hold</Button>
            </Stack>}
            {step === 5 && provisional && <Stack spacing={1.5} alignItems="flex-start" sx={{ py: 3 }}>
              <Typography component="h2" sx={{ fontSize: 23, fontWeight: 700 }}>Downpayment submitted</Typography>
              <Typography sx={{ fontSize: 13 }}>Your payment proof has been submitted for verification. The selected schedule is being held while your payment is reviewed. Your booking will proceed after Staff or Admin verifies the downpayment.</Typography>
              <Typography sx={{ fontSize: 13 }}>Booking Reference: {provisional._id}</Typography>
              <Typography sx={{ fontSize: 13 }}>Vehicle: {vehicle?.make} {vehicle?.model}</Typography>
              <Typography sx={{ fontSize: 13 }}>Schedule: {selectedDate} · {slot?.time}</Typography>
              <Typography sx={{ fontSize: 13 }}>Estimated Total: {money((paymentSummary?.estimatedTotalCents || 0) / 100)}</Typography>
              <Typography sx={{ fontSize: 13 }}>Downpayment Submitted: {money((paymentSummary?.downpaymentRequiredCents || 0) / 100)}</Typography>
              <Typography sx={{ fontSize: 13 }}>Payment Method: {formatPaymentMethod(paymentSummary?.payments?.filter(item => item.stage === 'downpayment').at(-1)?.method)}</Typography>
              <Typography sx={{ fontSize: 13 }}>Payment Status: Pending Verification</Typography>
              <Button variant="contained" component={Link} to="/client/bookings">View my bookings</Button>
            </Stack>}
            {step < 4 && <Stack direction="row" justifyContent="space-between" sx={{ mt: 4 }}><Button variant="outlined" sx={flowBackButtonSx} disabled={step === 0 || saving} onClick={() => setStep(value => value - 1)}>Back</Button>{step < 3 ? <Button variant="contained" sx={flowPrimaryButtonSx} disabled={!canContinue} onClick={continueStep}>Continue</Button> : <Button variant="contained" sx={flowPrimaryButtonSx} disabled={saving || !vehicle || !slot || !chosen.length} onClick={submit}>{saving ? 'Creating hold…' : 'Proceed to Downpayment'}</Button>}</Stack>}
          </>}
    </FormWorkspace>
  </>
}
