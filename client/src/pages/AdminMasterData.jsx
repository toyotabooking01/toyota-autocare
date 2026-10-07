import { useEffect, useState } from 'react'
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Paper, Stack, Switch, TextField, Typography } from '@mui/material'
import AddRounded from '@mui/icons-material/AddRounded'
import api from '../services/api'
import { PageHeading } from '../components/DashboardParts'

const definitions = {
  service: {
    title: 'Services', singular: 'service', endpoint: '/services',
    empty: { name: '', description: '', estimatedDuration: '', estimatedPrice: '', maintenanceReminderInterval: '', isActive: true },
  },
  bay: {
    title: 'Service bays', singular: 'bay', endpoint: '/service-bays',
    empty: { name: '', operationalStatus: 'operational' },
  },
}
const bayStatuses = [
  { value: 'operational', label: 'Operational' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'out_of_service', label: 'Out of service' },
]
function errorMessage(error) { return error.response?.data?.message || 'Request failed. Please try again.' }
function payload(kind, form) {
  if (kind === 'bay') return { name: form.name.trim(), operationalStatus: form.operationalStatus }
  return {
    name: form.name.trim(), description: form.description.trim(),
    estimatedDuration: Number(form.estimatedDuration), estimatedPrice: Number(form.estimatedPrice),
    maintenanceReminderInterval: form.maintenanceReminderInterval === '' ? null : Number(form.maintenanceReminderInterval),
    isActive: form.isActive,
  }
}
function validate(kind, form) {
  if (!form.name.trim()) return 'Name is required.'
  if (form.name.trim().length > (kind === 'bay' ? 80 : 120)) return 'Name is too long.'
  if (kind === 'bay') return ''
  if (form.description.length > 3000) return 'Description is too long.'
  if (!Number.isInteger(Number(form.estimatedDuration)) || Number(form.estimatedDuration) < 1) return 'Duration must be a positive whole number of minutes.'
  if (form.estimatedPrice === '' || !Number.isFinite(Number(form.estimatedPrice)) || Number(form.estimatedPrice) < 0) return 'Price must be zero or greater.'
  if (form.maintenanceReminderInterval !== '' && (!Number.isInteger(Number(form.maintenanceReminderInterval)) || Number(form.maintenanceReminderInterval) < 1)) return 'Reminder interval must be a positive whole number of days.'
  return ''
}

export default function AdminMasterData({ kind }) {
  const definition = definitions[kind]
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [archive, setArchive] = useState('active')
  const [status, setStatus] = useState('all')
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(definition.empty)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        const response = await api.get(definition.endpoint, { params: { archive, status, search }, signal: controller.signal })
        setItems(response.data.items)
      } catch (requestError) {
        if (!controller.signal.aborted) setError(errorMessage(requestError))
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }, search ? 250 : 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [definition.endpoint, archive, status, search, refresh])

  function openForm(item = null) {
    setEditing(item)
    setForm(item ? kind === 'service' ? {
      name: item.name, description: item.description || '', estimatedDuration: String(item.estimatedDuration),
      estimatedPrice: String(item.estimatedPrice), maintenanceReminderInterval: item.maintenanceReminderInterval == null ? '' : String(item.maintenanceReminderInterval), isActive: item.isActive,
    } : { name: item.name, operationalStatus: item.operationalStatus } : { ...definition.empty })
    setFormError('')
  }
  function change(key, value) { setForm(current => ({ ...current, [key]: value })); setFormError('') }
  async function save(event) {
    event.preventDefault()
    const problem = validate(kind, form)
    if (problem) { setFormError(problem); return }
    setSaving(true)
    setFormError('')
    try {
      if (editing?._id) await api.patch(`${definition.endpoint}/${editing._id}`, payload(kind, form))
      else await api.post(definition.endpoint, payload(kind, form))
      setNotice(`${definition.singular === 'bay' ? 'Bay' : 'Service'} ${editing?._id ? 'updated' : 'created'} successfully.`)
      setEditing(null)
      setRefresh(value => value + 1)
    } catch (requestError) { setFormError(errorMessage(requestError)) }
    finally { setSaving(false) }
  }
  async function toggleArchive() {
    const target = archiveTarget
    if (!target) return
    setSaving(true)
    try {
      await api.post(`${definition.endpoint}/${target._id}/${target.isArchived ? 'restore' : 'archive'}`)
      setNotice(`${target.name} ${target.isArchived ? 'restored' : 'archived'}.`)
      setArchiveTarget(null)
      setRefresh(value => value + 1)
    } catch (requestError) { setError(errorMessage(requestError)); setArchiveTarget(null) }
    finally { setSaving(false) }
  }
  const formOpen = editing !== null
  return <>
    <PageHeading title={definition.title} subtitle={`Manage your Toyota AutoCare ${definition.title.toLowerCase()} catalog.`} preview={false} />
    {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderColor: '#e5eaf1', borderRadius: 2.5 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2.5 }}>
        <TextField label="Search by name" size="small" value={search} onChange={event => setSearch(event.target.value)} sx={{ flex: 1, minWidth: 0 }} />
        <TextField select label="Records" size="small" value={archive} onChange={event => setArchive(event.target.value)} sx={{ minWidth: { sm: 145 } }}>
          <MenuItem value="active">Current</MenuItem><MenuItem value="archived">Archived</MenuItem><MenuItem value="all">All</MenuItem>
        </TextField>
        <TextField select label="Status" size="small" value={status} onChange={event => setStatus(event.target.value)} sx={{ minWidth: { sm: 165 } }}>
          <MenuItem value="all">All statuses</MenuItem>
          {kind === 'service' ? [<MenuItem key="active" value="active">Active</MenuItem>, <MenuItem key="inactive" value="inactive">Inactive</MenuItem>]
            : bayStatuses.map(option => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
        </TextField>
        <Button variant="contained" startIcon={<AddRounded />} onClick={() => openForm({})} sx={{ flexShrink: 0 }}>Add {definition.singular}</Button>
      </Stack>
      {loading ? <Stack alignItems="center" sx={{ py: 6 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 2, fontSize: 13 }}>Loading {definition.title.toLowerCase()}…</Typography></Stack>
        : !items.length ? <Typography sx={{ py: 5, textAlign: 'center', color: 'text.secondary', fontSize: 13 }}>No {definition.title.toLowerCase()} match these filters.</Typography>
          : <Stack spacing={1}>{items.map(item => <Box key={item._id} sx={{ p: 2, border: '1px solid #e9edf2', borderRadius: 2, bgcolor: item.isArchived ? '#f8f8fa' : 'white', display: 'flex', alignItems: { xs: 'stretch', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 2, minWidth: 0 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 650, overflowWrap: 'anywhere' }}>{item.name}</Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: .5, overflowWrap: 'anywhere' }}>{kind === 'service'
                ? `${item.estimatedDuration} min · ₱${Number(item.estimatedPrice).toLocaleString()}${item.description ? ` · ${item.description}` : ''}`
                : item.operationalStatus.replaceAll('_', ' ')}</Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Chip size="small" label={item.isArchived ? 'Archived' : kind === 'service' ? item.isActive ? 'Active' : 'Inactive' : item.operationalStatus.replaceAll('_', ' ')} sx={{ bgcolor: item.isArchived ? '#eef0f3' : kind === 'service' && item.isActive || kind === 'bay' && item.operationalStatus === 'operational' ? '#eaf6ed' : '#f7f3e9', color: item.isArchived ? '#596473' : '#365d4a' }} />
              {!item.isArchived && <Button size="small" variant="outlined" onClick={() => openForm(item)}>Edit</Button>}
              <Button size="small" color={item.isArchived ? 'primary' : 'inherit'} onClick={() => setArchiveTarget(item)}>{item.isArchived ? 'Restore' : 'Archive'}</Button>
            </Stack>
          </Box>)}</Stack>}
    </Paper>
    <Dialog open={formOpen} onClose={() => { if (!saving) setEditing(null) }} fullWidth maxWidth="sm" aria-labelledby="master-form-title">
      <Box component="form" onSubmit={save}>
        <DialogTitle id="master-form-title">{editing?._id ? 'Edit' : 'Add'} {definition.singular}</DialogTitle>
        <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <TextField label="Name" value={form.name || ''} onChange={event => change('name', event.target.value)} required fullWidth inputProps={{ maxLength: kind === 'service' ? 120 : 80 }} />
          {kind === 'service' ? <>
            <TextField label="Description" value={form.description || ''} onChange={event => change('description', event.target.value)} multiline minRows={2} fullWidth inputProps={{ maxLength: 3000 }} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Duration (minutes)" type="number" value={form.estimatedDuration} onChange={event => change('estimatedDuration', event.target.value)} required fullWidth inputProps={{ min: 1, step: 1 }} />
              <TextField label="Estimated price (PHP)" type="number" value={form.estimatedPrice} onChange={event => change('estimatedPrice', event.target.value)} required fullWidth inputProps={{ min: 0, step: 'any' }} />
            </Stack>
            <TextField label="Reminder interval (days, optional)" type="number" value={form.maintenanceReminderInterval} onChange={event => change('maintenanceReminderInterval', event.target.value)} fullWidth inputProps={{ min: 1, step: 1 }} />
            <FormControlLabel control={<Switch checked={Boolean(form.isActive)} onChange={event => change('isActive', event.target.checked)} />} label="Available for future booking" />
          </> : <TextField select label="Operational status" value={form.operationalStatus} onChange={event => change('operationalStatus', event.target.value)} fullWidth>
            {bayStatuses.map(option => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
          </TextField>}
        </Stack></DialogContent>
        <DialogActions sx={{ p: 2.5 }}><Button onClick={() => setEditing(null)} disabled={saving}>Cancel</Button><Button type="submit" variant="contained" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button></DialogActions>
      </Box>
    </Dialog>
    <Dialog open={Boolean(archiveTarget)} onClose={() => { if (!saving) setArchiveTarget(null) }} aria-labelledby="archive-title">
      <DialogTitle id="archive-title">{archiveTarget?.isArchived ? 'Restore' : 'Archive'} {definition.singular}?</DialogTitle>
      <DialogContent><Typography sx={{ fontSize: 13 }}> {archiveTarget?.name} {archiveTarget?.isArchived ? 'will return to the current list.' : 'will be kept for historical records and removed from the current list.'}</Typography></DialogContent>
      <DialogActions sx={{ p: 2 }}><Button disabled={saving} onClick={() => setArchiveTarget(null)}>Cancel</Button><Button disabled={saving} variant="contained" onClick={toggleArchive}>{saving ? 'Saving…' : archiveTarget?.isArchived ? 'Restore' : 'Archive'}</Button></DialogActions>
    </Dialog>
  </>
}
