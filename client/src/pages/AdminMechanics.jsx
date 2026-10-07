import { useState } from 'react'
import { Alert, Avatar, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import AddRounded from '@mui/icons-material/AddRounded'
import api from '../services/api'
import { PageHeading } from '../components/DashboardParts'
import useCatalog, { message } from './useCatalog'

const empty = { fullName: '', email: '', employeeId: '', phone: '', password: '', status: 'active', availability: 'available' }
const availability = ['available', 'busy', 'off_duty']
function validation(form, creating) {
  if (!form.fullName.trim() || form.fullName.trim().length > 120) return 'Enter a full name (up to 120 characters).'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'Enter a valid email address.'
  if (!form.employeeId.trim()) return 'Employee ID is required.'
  if (form.phone.trim() && !/^\+?[0-9 ()-]{7,20}$/.test(form.phone.trim())) return 'Enter a valid phone number.'
  if (creating && (form.password.length < 12 || new TextEncoder().encode(form.password).length > 72)) return 'Temporary password must have 12 or more characters and at most 72 UTF-8 bytes.'
  return ''
}
export default function AdminMechanics() {
  const [archive, setArchive] = useState('active')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [availabilityFilter, setAvailabilityFilter] = useState('all')
  const { items, loading, error, setError, reload } = useCatalog('/mechanics', { archive, search, status, availability: availabilityFilter })
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState(null)

  function openForm(item = {}) {
    setEditing(item)
    setForm(item._id ? { fullName: item.fullName, email: item.email, employeeId: item.employeeId, phone: item.phone || '', status: item.status, availability: item.availability, password: '' } : { ...empty })
    setFormError('')
  }
  function change(key, value) { setForm(current => ({ ...current, [key]: value })); setFormError('') }
  async function save(event) {
    event.preventDefault()
    const problem = validation(form, !editing?._id)
    if (problem) { setFormError(problem); return }
    setSaving(true)
    try {
      const data = { fullName: form.fullName.trim(), email: form.email.trim(), employeeId: form.employeeId.trim(), phone: form.phone.trim(), status: form.status, availability: form.availability }
      if (editing?._id) await api.patch(`/mechanics/${editing._id}`, data)
      else await api.post('/mechanics', { ...data, password: form.password })
      setEditing(null); setNotice(`Mechanic ${editing?._id ? 'updated' : 'created'} successfully.`); reload()
    } catch (requestError) { setFormError(message(requestError)) }
    finally { setSaving(false) }
  }
  async function toggleArchive() {
    const item = archiveTarget
    setSaving(true)
    try {
      await api.post(`/mechanics/${item._id}/${item.isArchived ? 'restore' : 'archive'}`)
      setArchiveTarget(null); setNotice(`Mechanic ${item.isArchived ? 'restored' : 'archived'}.`); reload()
    } catch (requestError) { setError(message(requestError)); setArchiveTarget(null) }
    finally { setSaving(false) }
  }
  return <>
    <PageHeading title="Mechanics" subtitle="Manage technician accounts and availability." preview={false} />
    {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderColor: '#e5eaf1', borderRadius: 2.5 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2.5 }}>
        <TextField label="Search mechanics" size="small" value={search} onChange={event => setSearch(event.target.value)} sx={{ flex: 1 }} />
        <TextField select label="Records" size="small" value={archive} onChange={event => setArchive(event.target.value)} sx={{ minWidth: 130 }}><MenuItem value="active">Current</MenuItem><MenuItem value="archived">Archived</MenuItem><MenuItem value="all">All</MenuItem></TextField>
        <TextField select label="Account" size="small" value={status} onChange={event => setStatus(event.target.value)} sx={{ minWidth: 125 }}><MenuItem value="all">All statuses</MenuItem><MenuItem value="active">Active</MenuItem><MenuItem value="inactive">Inactive</MenuItem></TextField>
        <TextField select label="Availability" size="small" value={availabilityFilter} onChange={event => setAvailabilityFilter(event.target.value)} sx={{ minWidth: 135 }}><MenuItem value="all">Any</MenuItem>{availability.map(value => <MenuItem key={value} value={value}>{value.replace('_', ' ')}</MenuItem>)}</TextField>
        <Button variant="contained" startIcon={<AddRounded />} onClick={() => openForm()}>Add mechanic</Button>
      </Stack>
      {loading ? <Stack alignItems="center" sx={{ py: 6 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 1 }}>Loading mechanics…</Typography></Stack>
        : items.length === 0 ? <Typography sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>No mechanics match these filters.</Typography>
          : <Stack spacing={1}>{items.map(item => <Box key={item._id} sx={{ p: 2, border: '1px solid #e9edf2', borderRadius: 2, bgcolor: item.isArchived ? '#f8f8fa' : 'white', display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, alignItems: { sm: 'center' }, minWidth: 0 }}>
            <Avatar sx={{ bgcolor: '#eef1f6', color: '#526073', display: { xs: 'none', sm: 'flex' } }}>{item.fullName[0]}</Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}><Typography sx={{ fontWeight: 650, fontSize: 14 }}>{item.fullName}</Typography><Typography sx={{ color: 'text.secondary', fontSize: 12, overflowWrap: 'anywhere' }}>{item.employeeId} · {item.email}</Typography></Box>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
              <Chip size="small" label={item.isArchived ? 'Archived' : item.status} sx={{ bgcolor: item.isArchived ? '#eef0f3' : item.status === 'active' ? '#eaf6ed' : '#f7f3e9' }} />
              {!item.isArchived && <Chip size="small" label={item.availability.replace('_', ' ')} variant="outlined" />}
              {!item.isArchived && <Button size="small" variant="outlined" onClick={() => openForm(item)}>Edit</Button>}
              <Button size="small" color={item.isArchived ? 'primary' : 'inherit'} onClick={() => setArchiveTarget(item)}>{item.isArchived ? 'Restore' : 'Archive'}</Button>
            </Stack>
          </Box>)}</Stack>}
    </Paper>
    <Dialog open={editing !== null} onClose={() => { if (!saving) setEditing(null) }} fullWidth maxWidth="sm" aria-labelledby="mechanic-form-title"><Box component="form" onSubmit={save}>
      <DialogTitle id="mechanic-form-title">{editing?._id ? 'Edit mechanic' : 'Add mechanic'}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        {formError && <Alert severity="error">{formError}</Alert>}
        <TextField label="Full name" required value={form.fullName} onChange={event => change('fullName', event.target.value)} />
        <TextField label="Email" type="email" required value={form.email} onChange={event => change('email', event.target.value)} />
        <TextField label="Employee ID" required value={form.employeeId} onChange={event => change('employeeId', event.target.value)} />
        <TextField label="Phone (optional)" value={form.phone} onChange={event => change('phone', event.target.value)} />
        {!editing?._id && <TextField label="Temporary password" type="password" required value={form.password} onChange={event => change('password', event.target.value)} helperText="12 or more characters, at most 72 UTF-8 bytes" autoComplete="new-password" />}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField select label="Account status" value={form.status} onChange={event => change('status', event.target.value)} fullWidth><MenuItem value="active">Active</MenuItem><MenuItem value="inactive">Inactive</MenuItem></TextField>
          <TextField select label="Availability" value={form.availability} onChange={event => change('availability', event.target.value)} fullWidth>{availability.map(value => <MenuItem key={value} value={value}>{value.replace('_', ' ')}</MenuItem>)}</TextField>
        </Stack>
      </Stack></DialogContent><DialogActions sx={{ p: 2.5 }}><Button disabled={saving} onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={saving} variant="contained">{saving ? 'Saving…' : 'Save'}</Button></DialogActions>
    </Box></Dialog>
    <Dialog open={Boolean(archiveTarget)} onClose={() => { if (!saving) setArchiveTarget(null) }} aria-labelledby="mechanic-archive-title"><DialogTitle id="mechanic-archive-title">{archiveTarget?.isArchived ? 'Restore' : 'Archive'} mechanic?</DialogTitle><DialogContent><Typography sx={{ fontSize: 13 }}>{archiveTarget?.fullName} {archiveTarget?.isArchived ? 'will return to the current list.' : 'will be retained for historical records. Unfinished assignments prevent archiving.'}</Typography></DialogContent><DialogActions sx={{ p: 2 }}><Button disabled={saving} onClick={() => setArchiveTarget(null)}>Cancel</Button><Button disabled={saving} variant="contained" onClick={toggleArchive}>{saving ? 'Saving…' : archiveTarget?.isArchived ? 'Restore' : 'Archive'}</Button></DialogActions></Dialog>
  </>
}
