import { useState } from 'react'
import { Alert, Box, Button, DialogActions, DialogContent, DialogTitle, Stack, TextField } from '@mui/material'
import { FormWorkspaceDialog } from '../components/FormWorkspace'
import { formWorkspaceGrid } from '../layouts/workspaceDimensions'
import api from '../services/api'
import useFormValidation from '../components/useFormValidation'
import { normalizePlateInput } from '../../../shared/accountValidation.mjs'
import { message } from './useCatalog'
import ToyotaVehiclePicker from '../components/ToyotaVehiclePicker'
import useToyotaCatalog from '../hooks/useToyotaCatalog'
import MileageInput from '../components/MileageInput'

const blank = { make: 'Toyota', model: '', year: '', variant: '', plateNumber: '', transmission: '', currentMileage: '' }

export default function WalkInVehicleDialog({ customer, onClose, onAdded }) {
  const [form, setForm] = useState(blank)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const catalog = useToyotaCatalog()
  const validation = useFormValidation('vehicle', form)
  function field(name, label, options = {}) {
    return <TextField fullWidth key={name} name={name} required={!options.optional} label={label} value={form[name]} {...validation.field(name)}
      type="text" disabled={busy} slotProps={{ htmlInput: { maxLength: options.maxLength } }}
      onChange={event => setForm(current => ({ ...current, [name]: name === 'plateNumber'
        ? normalizePlateInput(event.target.value) : event.target.value }))}
      onBlur={name === 'plateNumber' ? () => setForm(current => ({ ...current, plateNumber: normalizePlateInput(current.plateNumber, { trim: true }) })) : undefined} />
  }
  async function save(event) {
    event.preventDefault()
    if (busy || !validation.validate()) return
    setBusy(true); setError('')
    try {
      const payload = { ...form, variant: form.variant.trim(), year: Number(form.year),
        ...(form.currentMileage === '' ? {} : { currentMileage: Number(form.currentMileage) }) }
      if (form.currentMileage === '') delete payload.currentMileage
      const { data } = await api.post(`/bookings/walk-in/clients/${customer._id}/vehicles`, payload)
      onAdded(data.item)
    } catch (requestError) {
      validation.receive(requestError)
      setError(requestError.response?.data?.errors ? '' : message(requestError))
    } finally { setBusy(false) }
  }
  return <FormWorkspaceDialog open={Boolean(customer)} onClose={busy ? undefined : onClose}>
    <Stack component="form" noValidate onSubmit={save}>
      <DialogTitle>Add vehicle for {customer?.fullName}</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        {error && <Alert severity="error">{error}</Alert>}
        <ToyotaVehiclePicker value={form} onChange={changes => setForm(current => ({ ...current, ...changes }))}
          validation={validation} catalog={catalog} busy={busy}>
        <Box sx={formWorkspaceGrid}>{field('plateNumber', 'Plate Number', { maxLength: 8 })}
        <MileageInput label="Current mileage (optional)" optional disabled={busy} value={form.currentMileage}
          onValueChange={value => setForm(current => ({ ...current, currentMileage: value }))}
          {...validation.field('currentMileage')} /></Box>
        </ToyotaVehiclePicker>
      </Stack></DialogContent>
      <DialogActions><Button disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" variant="contained" disabled={busy}>{busy ? 'Adding…' : 'Add Vehicle'}</Button></DialogActions>
    </Stack>
  </FormWorkspaceDialog>
}
