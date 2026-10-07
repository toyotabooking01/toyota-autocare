import { useEffect, useState } from 'react'
import { Alert, Box, Button, Chip, CircularProgress, Divider, Paper, Stack, Step, StepLabel, Stepper, TextField, Typography } from '@mui/material'
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined'
import RadioButtonUncheckedOutlined from '@mui/icons-material/RadioButtonUncheckedOutlined'
import { Link } from 'react-router-dom'
import api from '../services/api'
import { PageHeading } from '../components/DashboardParts'
import { dateLabel, money, remaining } from './bookingDisplay'
import { message } from './useCatalog'

const steps = ['Customer', 'Vehicle', 'Services', 'Schedule', 'Review']
const choiceStyle = { p: 2, border: '1px solid #e5eaf1', borderRadius: 2, cursor: 'pointer', minWidth: 0, textAlign: 'left' }
export default function AdminWalkIn() {
  const [step, setStep] = useState(0)
  const [search, setSearch] = useState('')
  const [clients, setClients] = useState([])
  const [client, setClient] = useState(null)
  const [searching, setSearching] = useState(false)
  const [vehicles, setVehicles] = useState([])
  const [vehicleId, setVehicleId] = useState('')
  const [services, setServices] = useState([])
  const [serviceIds, setServiceIds] = useState([])
  const [slots, setSlots] = useState([])
  const [slotId, setSlotId] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingVehicles, setLoadingVehicles] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [completed, setCompleted] = useState(null)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    api.get('/bookings/walk-in/options', { signal: controller.signal })
      .then(response => {
        setServices(response.data.services)
        setSlots(response.data.schedules)
        setServiceIds(current => current.filter(id => response.data.services.some(item => item._id === id)))
      })
      .catch(requestError => { if (!controller.signal.aborted) setError(message(requestError)) })
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
      .then(response => setVehicles(response.data.items))
      .catch(requestError => { if (!controller.signal.aborted) setError(message(requestError)) })
      .finally(() => { if (!controller.signal.aborted) setLoadingVehicles(false) })
    return () => controller.abort()
  }, [client])
  const vehicle = vehicles.find(item => item._id === vehicleId)
  const chosen = services.filter(item => serviceIds.includes(item._id))
  const slot = slots.find(item => item._id === slotId)
  const estimate = chosen.reduce((sum, item) => sum + Number(item.estimatedPrice || 0), 0)
  const canContinue = [Boolean(client), Boolean(vehicle), chosen.length > 0, Boolean(slot), true][step]
  function chooseClient(item) { setClient(item); setVehicleId(''); setVehicles([]); setLoadingVehicles(true); setError('') }
  function toggleService(serviceId) { setServiceIds(current => current.includes(serviceId) ? current.filter(id => id !== serviceId) : [...current, serviceId]) }
  async function submit() {
    if (!client || !vehicle || !slot || !chosen.length || saving) return
    setSaving(true); setError('')
    try {
      const response = await api.post('/bookings/walk-in', { client: client._id, vehicle: vehicleId, services: serviceIds, schedule: slotId })
      setCompleted(response.data.item)
    } catch (requestError) {
      if (requestError.response?.status === 409) {
        setError('The selected schedule is no longer available. Please choose another time.')
        setSlotId(''); setStep(3); setRefresh(value => value + 1)
      } else { setError(message(requestError)); if (requestError.response?.status === 400) setRefresh(value => value + 1) }
    } finally { setSaving(false) }
  }
  return <>
    <PageHeading title="Walk-In booking" subtitle="Create a service visit for an existing customer and vehicle." preview={false} />
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderColor: '#e5eaf1', borderRadius: 2.5, maxWidth: 960 }}>
      {loading ? <Stack alignItems="center" sx={{ py: 8 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 1 }}>Loading walk-in options…</Typography></Stack>
        : completed ? <Stack spacing={2} alignItems="flex-start" sx={{ py: 4 }}>
          <Alert severity="success">Walk-In booking created as Confirmed. Check-In is a separate action in Bookings.</Alert>
          <Typography sx={{ fontSize: 13, overflowWrap: 'anywhere' }}>Reference: {completed._id}</Typography>
          <Button component={Link} to="/admin/bookings" variant="contained">View bookings</Button>
        </Stack> : <>
          <Stepper activeStep={step} alternativeLabel sx={{ mb: 4, display: { xs: 'none', sm: 'flex' } }}>{steps.map(label => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}</Stepper>
          <Typography sx={{ display: { sm: 'none' }, fontSize: 12, color: 'text.secondary', mb: 2 }}>Step {step + 1} of 5 · {steps[step]}</Typography>
          {step === 0 && <><Typography component="h2" sx={{ fontSize: 18, fontWeight: 700, mb: 1 }}>Find the customer</Typography>
            <TextField label="Search by name or email" value={search} onChange={event => { setSearch(event.target.value); setSearching(event.target.value.trim().length >= 2); setClients([]); setClient(null); setVehicleId(''); setVehicles([]) }} fullWidth size="small" helperText="Enter at least two characters. Only active Client accounts appear." />
            {searching && <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 2 }}>Searching…</Typography>}
            {search.trim().length >= 2 && !searching && !clients.length && <Alert severity="info" sx={{ mt: 2 }}>No active Client account found. The customer must already exist in the system.</Alert>}
            <Stack spacing={1} sx={{ mt: 2 }}>{clients.map(item => <Paper key={item._id} component="button" type="button" variant="outlined" onClick={() => chooseClient(item)} aria-pressed={client?._id === item._id} sx={{ ...choiceStyle, borderColor: client?._id === item._id ? 'primary.main' : '#e5eaf1', bgcolor: client?._id === item._id ? '#fff6f7' : 'white' }}><Typography sx={{ fontWeight: 650 }}>{item.fullName}</Typography><Typography sx={{ color: 'text.secondary', fontSize: 12 }}>{item.email}</Typography></Paper>)}</Stack>
          </>}
          {step === 1 && <><Typography component="h2" sx={{ fontSize: 18, fontWeight: 700, mb: 2 }}>Choose {client?.fullName}'s vehicle</Typography>
            {loadingVehicles ? <CircularProgress size={24} /> : !vehicles.length ? <Alert severity="info">This customer has no current vehicle. A vehicle must first be added to their account.</Alert> : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>{vehicles.map(item => <Paper key={item._id} component="button" type="button" variant="outlined" onClick={() => setVehicleId(item._id)} aria-pressed={vehicleId === item._id} sx={{ ...choiceStyle, borderColor: vehicleId === item._id ? 'primary.main' : '#e5eaf1', bgcolor: vehicleId === item._id ? '#fff6f7' : 'white' }}><Typography sx={{ fontWeight: 650 }}>{item.make} {item.model} {item.year}</Typography><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{item.plateNumber}</Typography></Paper>)}</Box>}
          </>}
          {step === 2 && <><Typography component="h2" sx={{ fontSize: 18, fontWeight: 700, mb: 2 }}>Choose services</Typography>
            {!services.length ? <Alert severity="info">No active services are available.</Alert> : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>{services.map(item => <Paper key={item._id} component="button" type="button" variant="outlined" onClick={() => toggleService(item._id)} aria-pressed={serviceIds.includes(item._id)} sx={{ ...choiceStyle, display: 'flex', gap: 1, alignItems: 'flex-start', borderColor: serviceIds.includes(item._id) ? 'primary.main' : '#e5eaf1', bgcolor: serviceIds.includes(item._id) ? '#fff6f7' : 'white' }}>{serviceIds.includes(item._id) ? <CheckCircleOutlined sx={{ color: 'primary.main' }} /> : <RadioButtonUncheckedOutlined sx={{ color: 'text.secondary' }} />}<Box><Typography sx={{ fontWeight: 650 }}>{item.name}</Typography><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{item.estimatedDuration} min · {money(item.estimatedPrice)}</Typography></Box></Paper>)}</Box>}
          </>}
          {step === 3 && <><Typography component="h2" sx={{ fontSize: 18, fontWeight: 700, mb: 2 }}>Choose a schedule</Typography>
            {!slots.length ? <Alert severity="info">No eligible schedule has remaining capacity.</Alert> : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>{slots.map(item => <Paper key={item._id} component="button" type="button" variant="outlined" onClick={() => setSlotId(item._id)} aria-pressed={slotId === item._id} sx={{ ...choiceStyle, borderColor: slotId === item._id ? 'primary.main' : '#e5eaf1', bgcolor: slotId === item._id ? '#fff6f7' : 'white' }}><Typography sx={{ fontWeight: 650 }}>{dateLabel(item.date)} · {item.timeSlot}</Typography><Chip size="small" label={`${remaining(item)} remaining`} sx={{ mt: 1, bgcolor: '#eaf6ed' }} /></Paper>)}</Box>}
          </>}
          {step === 4 && <><Typography component="h2" sx={{ fontSize: 18, fontWeight: 700, mb: 2 }}>Review walk-in</Typography><Stack spacing={2} divider={<Divider />}>
            <Box><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Customer</Typography><Typography sx={{ fontWeight: 600 }}>{client?.fullName} · {client?.email}</Typography></Box>
            <Box><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Vehicle</Typography><Typography sx={{ fontWeight: 600 }}>{vehicle?.make} {vehicle?.model} · {vehicle?.plateNumber}</Typography></Box>
            <Box><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Services</Typography>{chosen.map(item => <Stack key={item._id} direction="row" justifyContent="space-between" gap={2}><Typography sx={{ fontSize: 13 }}>{item.name}</Typography><Typography sx={{ fontSize: 13 }}>{money(item.estimatedPrice)}</Typography></Stack>)}</Box>
            <Box><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Schedule</Typography><Typography sx={{ fontWeight: 600 }}>{slot && `${dateLabel(slot.date)} · ${slot.timeSlot}`}</Typography></Box>
            <Stack direction="row" justifyContent="space-between"><Typography sx={{ fontWeight: 700 }}>Estimated total</Typography><Typography sx={{ fontWeight: 700 }}>{money(estimate)}</Typography></Stack>
          </Stack><Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 2 }}>Created as Confirmed. Check-In remains a separate desk action. Estimate uses current service prices.</Typography></>}
          <Stack direction="row" justifyContent="space-between" sx={{ mt: 4 }}><Button variant="outlined" disabled={step === 0 || saving} onClick={() => setStep(value => value - 1)}>Back</Button>{step < 4 ? <Button variant="contained" disabled={!canContinue || saving} onClick={() => setStep(value => value + 1)}>Continue</Button> : <Button variant="contained" disabled={saving || !client || !vehicle || !slot || !chosen.length} onClick={submit}>{saving ? 'Creating…' : 'Create Walk-In booking'}</Button>}</Stack>
        </>}
    </Paper>
  </>
}
