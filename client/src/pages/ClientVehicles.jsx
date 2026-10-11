import ConfirmationDialog from '../components/ConfirmationDialog'
import { useConfirmation } from '../components/ConfirmationContext'
import useFormValidation from '../components/useFormValidation'
import { useState } from 'react'
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import AddRounded from '@mui/icons-material/AddRounded'
import DirectionsCarOutlined from '@mui/icons-material/DirectionsCarOutlined'
import api from '../services/api'
import { PageHeading } from '../components/DashboardParts'
import useCatalog, { message } from './useCatalog'
import { normalizePlateInput } from '../../../shared/accountValidation.mjs'

const empty = { make: 'Toyota', model: '', year: '', plateNumber: '', transmission: 'automatic', currentMileage: '' }

export default function ClientVehicles() {
  const confirm = useConfirmation()
  const [archive, setArchive] = useState('active')
  const { items, loading, error, setError, reload } = useCatalog('/vehicles', { archive })
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [formError, setFormError] = useState('')
  const validation = useFormValidation('clientVehicle', form)
  const [saving, setSaving] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState(null)
  function openForm(item = {}) {
    validation.reset()
    setEditing(item)
    setForm(item._id ? { make: item.make, model: item.model, year: String(item.year), plateNumber: item.plateNumber, transmission: item.transmission, currentMileage: String(item.currentMileage) } : { ...empty })
    setFormError('')
  }
  function change(key, value) { setForm(current => ({ ...current, [key]: value })); setFormError('') }
  async function save(event) {
    event.preventDefault()
    if (saving || !validation.validate()) return
    return confirm(editing?._id ? 'Are you sure you want to save these changes?' : 'Are you sure you want to add this vehicle?', async () => {
      setSaving(true)
      try {
        const data = { make: form.make.trim(), model: form.model.trim(), year: Number(form.year), plateNumber: normalizePlateInput(form.plateNumber, { trim: true }), transmission: form.transmission, currentMileage: Number(form.currentMileage) }
        if (editing?._id) await api.patch(`/vehicles/${editing._id}`, data)
        else await api.post('/vehicles', data)
        setEditing(null); setNotice(`Vehicle ${editing?._id ? 'updated' : 'added'} successfully.`); reload()
      } catch (requestError) { validation.receive(requestError); setFormError(requestError.response?.data?.errors ? '' : message(requestError)) }
      finally { setSaving(false) }
    })
  }
  async function toggleArchive() {
    if (saving || !archiveTarget) return
    const item = archiveTarget
    setSaving(true)
    try {
      await api.post(`/vehicles/${item._id}/${item.isArchived ? 'restore' : 'archive'}`)
      setArchiveTarget(null); setNotice(`Vehicle ${item.isArchived ? 'restored' : 'archived'}.`); reload()
    } catch (requestError) { setError(message(requestError)); setArchiveTarget(null) }
    finally { setSaving(false) }
  }
  return <>
    <PageHeading title="My vehicles" subtitle="Keep your Toyota vehicle details up to date." preview={false} />
    {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderColor: 'var(--line)', borderRadius: 2.5 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1.5} sx={{ mb: 2.5 }}>
        <TextField select label="Records" size="small" value={archive} onChange={event => setArchive(event.target.value)} sx={{ minWidth: 155 }}><MenuItem value="active">Current vehicles</MenuItem><MenuItem value="archived">Archived vehicles</MenuItem><MenuItem value="all">All vehicles</MenuItem></TextField>
        <Button variant="contained" startIcon={<AddRounded />} onClick={() => openForm()}>Add vehicle</Button>
      </Stack>
      {loading ? <Stack alignItems="center" sx={{ py: 6 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 1 }}>Loading vehicles…</Typography></Stack>
        : items.length === 0 ? <Typography sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>No vehicles in this view.</Typography>
          : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>{items.map(item => <Paper key={item._id} variant="outlined" sx={{ p: 2, borderColor: 'var(--line)', borderRadius: 2, bgcolor: item.isArchived ? 'var(--surface-soft)' : 'var(--surface)', minWidth: 0 }}>
            <Stack direction="row" spacing={1.5} alignItems="center"><Box sx={{ display: 'flex', p: 1.3, borderRadius: 2, bgcolor: 'var(--surface-soft)', color: 'var(--muted)' }}><DirectionsCarOutlined /></Box>
              <Box sx={{ flex: 1, minWidth: 0 }}><Typography sx={{ fontSize: 15, fontWeight: 650, overflowWrap: 'anywhere' }}>{item.make} {item.model}</Typography><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{item.year} · {item.plateNumber}</Typography></Box>
              <Chip size="small" label={item.isArchived ? 'Archived' : 'Current'} sx={{ bgcolor: item.isArchived ? 'var(--surface-soft)' : 'var(--green-soft)' }} />
            </Stack><Typography sx={{ fontSize: 12, color: 'text.secondary', my: 2 }}>{item.transmission.toUpperCase()} · {Number(item.currentMileage).toLocaleString()} km</Typography>
            <Stack direction="row" spacing={1}>{!item.isArchived && <Button size="small" variant="outlined" onClick={() => openForm(item)}>Edit</Button>}<Button size="small" color={item.isArchived ? 'primary' : 'inherit'} onClick={() => setArchiveTarget(item)}>{item.isArchived ? 'Restore' : 'Archive'}</Button></Stack>
          </Paper>)}</Box>}
    </Paper>
    <Dialog open={editing !== null} onClose={() => { if (!saving) setEditing(null) }} fullWidth maxWidth="sm" aria-labelledby="vehicle-form-title"><Box component="form" noValidate onSubmit={save}>
      <DialogTitle id="vehicle-form-title">{editing?._id ? 'Edit vehicle' : 'Add vehicle'}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        {formError && <Alert severity="error">{formError}</Alert>}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField label="Make" required fullWidth value={form.make} {...validation.field('make')} onChange={event => change('make', event.target.value)} /><TextField label="Model" required fullWidth value={form.model} {...validation.field('model')} onChange={event => change('model', event.target.value)} /></Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField label="Year" type="text" required fullWidth value={form.year} {...validation.field('year')} onChange={event => { const value = event.target.value; if (/^\d{0,4}$/.test(value)) change('year', value) }} slotProps={{ htmlInput: { maxLength: 4, inputMode: 'numeric' } }} /><TextField label="Plate number" required fullWidth value={form.plateNumber} {...validation.field('plateNumber')} slotProps={{ htmlInput: { maxLength: 30, style: { textTransform: 'uppercase' } } }} onBlur={() => change('plateNumber', normalizePlateInput(form.plateNumber, { trim: true }))} onChange={event => change('plateNumber', normalizePlateInput(event.target.value))} /></Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField select label="Transmission" required fullWidth value={form.transmission} {...validation.field('transmission')} onChange={event => change('transmission', event.target.value)}><MenuItem value="automatic">Automatic</MenuItem><MenuItem value="manual">Manual</MenuItem><MenuItem value="cvt">CVT</MenuItem></TextField><TextField label="Current mileage" type="text" required fullWidth value={form.currentMileage} {...validation.field('currentMileage')} onChange={event => { const value = event.target.value; if (/^\d{0,7}$/.test(value)) change('currentMileage', value) }} slotProps={{ htmlInput: { maxLength: 7, inputMode: 'numeric' }, input: { endAdornment: <InputAdornment position="end">km</InputAdornment> } }} /></Stack>
      </Stack></DialogContent><DialogActions sx={{ p: 2.5 }}><Button disabled={saving} onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={saving} variant="contained">{saving ? 'Saving…' : 'Save'}</Button></DialogActions>
    </Box></Dialog>
    <ConfirmationDialog open={Boolean(archiveTarget)} busy={saving} onCancel={() => setArchiveTarget(null)} onConfirm={toggleArchive}
      message={archiveTarget?.isArchived ? 'Are you sure you want to restore this vehicle?' : 'Are you sure you want to remove this vehicle?'}
      details={archiveTarget?.isArchived ? 'The vehicle will return to your current vehicles.' : 'The vehicle will be archived and kept for historical records.'} />
  </>
}
