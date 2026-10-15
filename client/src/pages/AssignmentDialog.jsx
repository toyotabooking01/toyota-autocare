import { useConfirmation } from '../components/ConfirmationContext'
import useFormValidation from '../components/useFormValidation'
import { useEffect, useState } from 'react'
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material'
import api from '../services/api'
import { message } from './useCatalog'
import { mechanicAvailabilityLabel } from '../utils/mechanicAvailability'

export default function AssignmentDialog({ booking, onClose, onAssigned }) {
  const confirm = useConfirmation()
  const [options, setOptions] = useState({ mechanics: [], serviceBays: [] })
  const [mechanic, setMechanic] = useState('')
  const [serviceBay, setServiceBay] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const validation = useFormValidation('assignment', { mechanic, serviceBay }, { available: { mechanic: options.mechanics, serviceBay: options.serviceBays } })
  useEffect(() => {
    if (!booking) return undefined
    const controller = new AbortController()
    api.get('/bookings/assignment-options', { signal: controller.signal })
      .then(response => setOptions(response.data))
      .catch(requestError => { if (!controller.signal.aborted) setError(message(requestError)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [booking])
  async function submit(event) {
    event.preventDefault()
    if (!validation.validate() || !booking || saving) return
    return confirm('Are you sure you want to assign this mechanic and service bay?', async () => {
      setSaving(true); setError('')
      try {
        const response = await api.post(`/bookings/${booking._id}/assign`, { mechanic, serviceBay })
        onAssigned(response.data.item)
      } catch (requestError) {
        validation.receive(requestError)
        setError(requestError.response?.data?.errors ? '' : message(requestError))
      } finally { setSaving(false) }
    })
  }
  return <Dialog open={Boolean(booking)} onClose={() => { if (!saving) onClose() }} fullWidth maxWidth="sm" aria-labelledby="assignment-title">
    <Stack component="form" noValidate onSubmit={submit}>
      <DialogTitle id="assignment-title">Assign Mechanic &amp; Bay</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        <Typography sx={{ fontSize: 13, color: 'text.secondary', overflowWrap: 'anywhere' }}>Checked-in booking {booking?._id}</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {loading ? <Stack alignItems="center" sx={{ py: 3 }} role="status"><CircularProgress size={25} /></Stack> : <>
          {!options.mechanics.length && <Alert severity="info">No available Mechanics. Check their account status and availability.</Alert>}
          {!options.serviceBays.length && <Alert severity="info">No operational, available Service Bays.</Alert>}
          <TextField select required label="Mechanic" value={mechanic} {...validation.field('mechanic')} onChange={event => setMechanic(event.target.value)} disabled={!options.mechanics.length || saving} fullWidth>
            {options.mechanics.map(item => <MenuItem key={item._id} value={item._id}>{item.fullName} ({item.employeeId}) · {mechanicAvailabilityLabel(item.availability)}</MenuItem>)}
          </TextField>
          <TextField select required label="Service Bay" value={serviceBay} {...validation.field('serviceBay')} onChange={event => setServiceBay(event.target.value)} disabled={!options.serviceBays.length || saving} fullWidth>
            {options.serviceBays.map(item => <MenuItem key={item._id} value={item._id}>{item.name} - Available</MenuItem>)}
          </TextField>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Assignment creates one Job Order. Service has not started.</Typography>
        </>}
      </Stack></DialogContent>
      <DialogActions sx={{ p: 2 }}><Button disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" variant="contained" disabled={saving || loading || !mechanic || !serviceBay}>Assign</Button></DialogActions>
    </Stack>
  </Dialog>
}
