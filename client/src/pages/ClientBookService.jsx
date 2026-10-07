import { useEffect, useState } from 'react'
import { Alert, Box, Button, Chip, CircularProgress, Divider, Paper, Stack, Step, StepLabel, Stepper, Typography } from '@mui/material'
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined'
import RadioButtonUncheckedOutlined from '@mui/icons-material/RadioButtonUncheckedOutlined'
import { Link } from 'react-router-dom'
import api from '../services/api'
import { PageHeading } from '../components/DashboardParts'
import { dateLabel, money, remaining } from './bookingDisplay'
import { message } from './useCatalog'

const steps = ['Vehicle', 'Services', 'Schedule', 'Review']
const card = { p: 2, border: '1px solid #e5eaf1', borderRadius: 2, cursor: 'pointer', minWidth: 0 }
export default function ClientBookService() {
  const [vehicles, setVehicles] = useState([])
  const [services, setServices] = useState([])
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [optionsError, setOptionsError] = useState(false)
  const [notice, setNotice] = useState('')
  const [step, setStep] = useState(0)
  const [vehicleId, setVehicleId] = useState('')
  const [serviceIds, setServiceIds] = useState([])
  const [slotId, setSlotId] = useState('')
  const [saving, setSaving] = useState(false)
  const [completed, setCompleted] = useState(null)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      api.get('/vehicles', { params: { archive: 'active' }, signal: controller.signal }),
      api.get('/bookings/options', { signal: controller.signal }),
      api.get('/schedules/available', { signal: controller.signal }),
    ]).then(([vehicleResponse, optionResponse, slotResponse]) => {
      setVehicles(vehicleResponse.data.items)
      setServices(optionResponse.data.services)
      setSlots(slotResponse.data.items)
      setServiceIds(current => current.filter(id => optionResponse.data.services.some(item => item._id === id)))
      setOptionsError(false)
      setError('')
    }).catch(requestError => { if (!controller.signal.aborted) {
      setVehicles([]); setServices([]); setSlots([]); setOptionsError(true); setError(message(requestError))
    } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [refresh])
  const vehicle = vehicles.find(item => item._id === vehicleId)
  const chosen = services.filter(item => serviceIds.includes(item._id))
  const slot = slots.find(item => item._id === slotId)
  const estimate = chosen.reduce((sum, item) => sum + Number(item.estimatedPrice || 0), 0)
  const canContinue = [Boolean(vehicle), chosen.length > 0, Boolean(slot), true][step]
  function toggleService(serviceId) {
    setServiceIds(current => current.includes(serviceId) ? current.filter(id => id !== serviceId) : [...current, serviceId])
  }
  async function submit() {
    if (!vehicle || !slot || !chosen.length || saving) return
    setSaving(true); setError('')
    try {
      const response = await api.post('/bookings', { vehicle: vehicleId, services: serviceIds, schedule: slotId })
      setCompleted(response.data.item)
      setNotice('Booking submitted. It is awaiting confirmation.')
    } catch (requestError) {
      setError(requestError.response?.status === 409 ? 'The selected schedule is no longer available. Please choose another time.' : message(requestError))
      if (requestError.response?.status === 409) { setSlotId(''); setStep(2); setRefresh(value => value + 1) }
      else if (requestError.response?.status === 400) setRefresh(value => value + 1)
    } finally { setSaving(false) }
  }
  return <>
    <PageHeading title="Book a service" subtitle="Select your Toyota, services, and a time that works for you." preview={false} />
    {notice && <Alert severity="success" sx={{ mb: 2 }}>{notice}</Alert>}
    {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderColor: '#e5eaf1', borderRadius: 2.5, maxWidth: 950 }}>
      {loading ? <Stack alignItems="center" sx={{ py: 8 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 1 }}>Loading booking options…</Typography></Stack>
        : optionsError ? <Stack alignItems="flex-start" spacing={2} sx={{ py: 5 }}><Typography sx={{ color: 'text.secondary', fontSize: 13 }}>Booking options could not be loaded.</Typography><Button variant="outlined" onClick={() => { setError(''); setOptionsError(false); setLoading(true); setRefresh(value => value + 1) }}>Retry loading</Button></Stack>
        : completed ? <Stack spacing={2} alignItems="flex-start" sx={{ py: 4 }}><Typography component="h2" sx={{ fontSize: 23, fontWeight: 700 }}>Booking received</Typography><Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Reference: {completed._id}. You can follow its status in My Bookings.</Typography><Button variant="contained" component={Link} to="/client/bookings">View my bookings</Button></Stack>
          : <>
            <Stepper activeStep={step} alternativeLabel sx={{ mb: 4, display: { xs: 'none', sm: 'flex' } }}>{steps.map(label => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}</Stepper>
            <Typography sx={{ display: { sm: 'none' }, fontSize: 12, color: 'text.secondary', mb: 2 }}>Step {step + 1} of 4 · {steps[step]}</Typography>
            {step === 0 && <><Typography component="h2" sx={{ fontSize: 18, fontWeight: 700, mb: 2 }}>Choose your vehicle</Typography>
              {!vehicles.length ? <Alert severity="info">Add a vehicle in My Vehicles before booking.</Alert> : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>{vehicles.map(item => <Paper key={item._id} component="button" type="button" onClick={() => setVehicleId(item._id)} aria-pressed={vehicleId === item._id} variant="outlined" sx={{ ...card, textAlign: 'left', borderColor: vehicleId === item._id ? 'primary.main' : '#e5eaf1', bgcolor: vehicleId === item._id ? '#fff6f7' : 'white' }}><Typography sx={{ fontWeight: 650 }}>{item.make} {item.model} {item.year}</Typography><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{item.plateNumber}</Typography></Paper>)}</Box>}
            </>}
            {step === 1 && <><Typography component="h2" sx={{ fontSize: 18, fontWeight: 700, mb: .5 }}>Choose services</Typography><Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 2 }}>You can select more than one.</Typography>
              {!services.length ? <Alert severity="info">No services are currently available.</Alert> : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>{services.map(item => <Paper key={item._id} component="button" type="button" onClick={() => toggleService(item._id)} aria-pressed={serviceIds.includes(item._id)} variant="outlined" sx={{ ...card, textAlign: 'left', display: 'flex', gap: 1, alignItems: 'flex-start', borderColor: serviceIds.includes(item._id) ? 'primary.main' : '#e5eaf1', bgcolor: serviceIds.includes(item._id) ? '#fff6f7' : 'white' }}>{serviceIds.includes(item._id) ? <CheckCircleOutlined sx={{ color: 'primary.main' }} /> : <RadioButtonUncheckedOutlined sx={{ color: 'text.secondary' }} />}<Box><Typography sx={{ fontWeight: 650 }}>{item.name}</Typography><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{item.estimatedDuration} min · {money(item.estimatedPrice)}</Typography>{item.description && <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: .5 }}>{item.description}</Typography>}</Box></Paper>)}</Box>}
            </>}
            {step === 2 && <><Typography component="h2" sx={{ fontSize: 18, fontWeight: 700, mb: 2 }}>Choose an available schedule</Typography>
              {!slots.length ? <Alert severity="info">No future schedules have capacity right now.</Alert> : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>{slots.map(item => <Paper key={item._id} component="button" type="button" onClick={() => setSlotId(item._id)} aria-pressed={slotId === item._id} variant="outlined" sx={{ ...card, textAlign: 'left', borderColor: slotId === item._id ? 'primary.main' : '#e5eaf1', bgcolor: slotId === item._id ? '#fff6f7' : 'white' }}><Typography sx={{ fontWeight: 650 }}>{dateLabel(item.date)} · {item.timeSlot}</Typography><Chip size="small" label={`${remaining(item)} remaining`} sx={{ mt: 1, bgcolor: '#eaf6ed' }} /></Paper>)}</Box>}
            </>}
            {step === 3 && <><Typography component="h2" sx={{ fontSize: 18, fontWeight: 700, mb: 2 }}>Review your booking</Typography><Stack spacing={2} divider={<Divider />}>
              <Box><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Vehicle</Typography><Typography sx={{ fontWeight: 600 }}>{vehicle?.make} {vehicle?.model} · {vehicle?.plateNumber}</Typography></Box>
              <Box><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Services</Typography>{chosen.map(item => <Stack key={item._id} direction="row" justifyContent="space-between" gap={1}><Typography sx={{ fontSize: 13 }}>{item.name}</Typography><Typography sx={{ fontSize: 13 }}>{money(item.estimatedPrice)}</Typography></Stack>)}</Box>
              <Box><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Schedule</Typography><Typography sx={{ fontWeight: 600 }}>{slot && `${dateLabel(slot.date)} · ${slot.timeSlot}`}</Typography></Box>
              <Stack direction="row" justifyContent="space-between"><Typography sx={{ fontWeight: 700 }}>Estimated total</Typography><Typography sx={{ fontWeight: 700 }}>{money(estimate)}</Typography></Stack>
            </Stack><Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 2 }}>Estimate uses current service prices. No payment is collected here.</Typography></>}
            <Stack direction="row" justifyContent="space-between" sx={{ mt: 4 }}><Button variant="outlined" disabled={step === 0 || saving} onClick={() => setStep(value => value - 1)}>Back</Button>{step < 3 ? <Button variant="contained" disabled={!canContinue} onClick={() => setStep(value => value + 1)}>Continue</Button> : <Button variant="contained" disabled={saving || !vehicle || !slot || !chosen.length} onClick={submit}>{saving ? 'Submitting…' : 'Submit booking'}</Button>}</Stack>
          </>}
    </Paper>
  </>
}
