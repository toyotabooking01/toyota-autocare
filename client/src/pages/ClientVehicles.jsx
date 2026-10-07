import { useState } from 'react'
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import AddRounded from '@mui/icons-material/AddRounded'
import DirectionsCarOutlined from '@mui/icons-material/DirectionsCarOutlined'
import api from '../services/api'
import { PageHeading } from '../components/DashboardParts'
import useCatalog, { message } from './useCatalog'

const empty = { make: 'Toyota', model: '', year: '', plateNumber: '', transmission: 'automatic', currentMileage: '0' }
const currentYear = new Date().getFullYear()
function validation(form) {
  if (!form.make.trim() || !form.model.trim()) return 'Make and model are required.'
  if (!Number.isInteger(Number(form.year)) || Number(form.year) < 1886 || Number(form.year) > currentYear + 1) return 'Enter a valid vehicle year.'
  if (!/^[A-Z0-9]{4,10}$/.test(form.plateNumber.toUpperCase().replace(/[\s-]/g, ''))) return 'Plate must contain 4 to 10 letters or digits.'
  if (!Number.isInteger(Number(form.currentMileage)) || Number(form.currentMileage) < 0) return 'Mileage must be a non-negative whole number.'
  return ''
}
export default function ClientVehicles() {
  const [archive, setArchive] = useState('active')
  const { items, loading, error, setError, reload } = useCatalog('/vehicles', { archive })
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState(null)
  function openForm(item = {}) {
    setEditing(item)
    setForm(item._id ? { make: item.make, model: item.model, year: String(item.year), plateNumber: item.plateNumber, transmission: item.transmission, currentMileage: String(item.currentMileage) } : { ...empty })
    setFormError('')
  }
  function change(key, value) { setForm(current => ({ ...current, [key]: value })); setFormError('') }
  async function save(event) {
    event.preventDefault()
    const problem = validation(form)
    if (problem) { setFormError(problem); return }
    setSaving(true)
    try {
      const data = { make: form.make.trim(), model: form.model.trim(), year: Number(form.year), plateNumber: form.plateNumber.trim(), transmission: form.transmission, currentMileage: Number(form.currentMileage) }
      if (editing?._id) await api.patch(`/vehicles/${editing._id}`, data)
      else await api.post('/vehicles', data)
      setEditing(null); setNotice(`Vehicle ${editing?._id ? 'updated' : 'added'} successfully.`); reload()
    } catch (requestError) { setFormError(message(requestError)) }
    finally { setSaving(false) }
  }
  async function toggleArchive() {
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
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderColor: '#e5eaf1', borderRadius: 2.5 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1.5} sx={{ mb: 2.5 }}>
        <TextField select label="Records" size="small" value={archive} onChange={event => setArchive(event.target.value)} sx={{ minWidth: 155 }}><MenuItem value="active">Current vehicles</MenuItem><MenuItem value="archived">Archived vehicles</MenuItem><MenuItem value="all">All vehicles</MenuItem></TextField>
        <Button variant="contained" startIcon={<AddRounded />} onClick={() => openForm()}>Add vehicle</Button>
      </Stack>
      {loading ? <Stack alignItems="center" sx={{ py: 6 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 1 }}>Loading vehicles…</Typography></Stack>
        : items.length === 0 ? <Typography sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>No vehicles in this view.</Typography>
          : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>{items.map(item => <Paper key={item._id} variant="outlined" sx={{ p: 2, borderColor: '#e9edf2', borderRadius: 2, bgcolor: item.isArchived ? '#f8f8fa' : 'white', minWidth: 0 }}>
            <Stack direction="row" spacing={1.5} alignItems="center"><Box sx={{ display: 'flex', p: 1.3, borderRadius: 2, bgcolor: '#f2f5f9', color: '#526073' }}><DirectionsCarOutlined /></Box>
              <Box sx={{ flex: 1, minWidth: 0 }}><Typography sx={{ fontSize: 15, fontWeight: 650, overflowWrap: 'anywhere' }}>{item.make} {item.model}</Typography><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{item.year} · {item.plateNumber}</Typography></Box>
              <Chip size="small" label={item.isArchived ? 'Archived' : 'Current'} sx={{ bgcolor: item.isArchived ? '#eef0f3' : '#eaf6ed' }} />
            </Stack><Typography sx={{ fontSize: 12, color: 'text.secondary', my: 2 }}>{item.transmission.toUpperCase()} · {Number(item.currentMileage).toLocaleString()} km</Typography>
            <Stack direction="row" spacing={1}>{!item.isArchived && <Button size="small" variant="outlined" onClick={() => openForm(item)}>Edit</Button>}<Button size="small" color={item.isArchived ? 'primary' : 'inherit'} onClick={() => setArchiveTarget(item)}>{item.isArchived ? 'Restore' : 'Archive'}</Button></Stack>
          </Paper>)}</Box>}
    </Paper>
    <Dialog open={editing !== null} onClose={() => { if (!saving) setEditing(null) }} fullWidth maxWidth="sm" aria-labelledby="vehicle-form-title"><Box component="form" onSubmit={save}>
      <DialogTitle id="vehicle-form-title">{editing?._id ? 'Edit vehicle' : 'Add vehicle'}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        {formError && <Alert severity="error">{formError}</Alert>}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField label="Make" required fullWidth value={form.make} onChange={event => change('make', event.target.value)} /><TextField label="Model" required fullWidth value={form.model} onChange={event => change('model', event.target.value)} /></Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField label="Year" type="number" required fullWidth value={form.year} onChange={event => change('year', event.target.value)} inputProps={{ min: 1886, max: currentYear + 1, step: 1 }} /><TextField label="Plate number" required fullWidth value={form.plateNumber} onChange={event => change('plateNumber', event.target.value)} /></Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField select label="Transmission" fullWidth value={form.transmission} onChange={event => change('transmission', event.target.value)}><MenuItem value="automatic">Automatic</MenuItem><MenuItem value="manual">Manual</MenuItem><MenuItem value="cvt">CVT</MenuItem></TextField><TextField label="Current mileage (km)" type="number" required fullWidth value={form.currentMileage} onChange={event => change('currentMileage', event.target.value)} inputProps={{ min: 0, step: 1 }} /></Stack>
      </Stack></DialogContent><DialogActions sx={{ p: 2.5 }}><Button disabled={saving} onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={saving} variant="contained">{saving ? 'Saving…' : 'Save'}</Button></DialogActions>
    </Box></Dialog>
    <Dialog open={Boolean(archiveTarget)} onClose={() => { if (!saving) setArchiveTarget(null) }} aria-labelledby="vehicle-archive-title"><DialogTitle id="vehicle-archive-title">{archiveTarget?.isArchived ? 'Restore' : 'Archive'} vehicle?</DialogTitle><DialogContent><Typography sx={{ fontSize: 13 }}>{archiveTarget?.make} {archiveTarget?.model} {archiveTarget?.isArchived ? 'will return to your current vehicles.' : 'will be kept for historical records.'}</Typography></DialogContent><DialogActions sx={{ p: 2 }}><Button disabled={saving} onClick={() => setArchiveTarget(null)}>Cancel</Button><Button disabled={saving} variant="contained" onClick={toggleArchive}>{saving ? 'Saving…' : archiveTarget?.isArchived ? 'Restore' : 'Archive'}</Button></DialogActions></Dialog>
  </>
}
