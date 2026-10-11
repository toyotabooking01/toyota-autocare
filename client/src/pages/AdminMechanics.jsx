import ConfirmationDialog from '../components/ConfirmationDialog'
import { useConfirmation } from '../components/ConfirmationContext'
import useFormValidation from '../components/useFormValidation'
import { useState } from 'react'
import { Alert, Avatar, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import AddRounded from '@mui/icons-material/AddRounded'
import api from '../services/api'
import { PageHeading } from '../components/DashboardParts'
import useCatalog, { message } from './useCatalog'
import ListPagination from '../components/ListPagination'
import { REGISTRATION_MOBILE_HINT, normalizeMobile, restrictMobileInput } from '../../../shared/accountValidation.mjs'
import { mechanicAvailabilityLabel } from '../utils/mechanicAvailability'

const empty = { fullName: '', email: '', phone: '', status: 'active', availability: 'available' }
const availability = ['available', 'busy', 'off_duty']

export default function AdminMechanics() {
  const confirm = useConfirmation()
  const [archive, setArchive] = useState('active')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [availabilityFilter, setAvailabilityFilter] = useState('all')
  const { items, loading, error, setError, reload, pagination } = useCatalog('/mechanics', { archive, search, status, availability: availabilityFilter }, true)
  const [notice, setNotice] = useState('')
  const [noticeSeverity, setNoticeSeverity] = useState('success')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [formError, setFormError] = useState('')
  const validation = useFormValidation('mechanic', form)
  const [saving, setSaving] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState(null)

  function openForm(item = {}) {
    validation.reset()
    setEditing(item)
    setForm(item._id ? { fullName: item.fullName, email: item.email, phone: item.phone || '', status: item.status, availability: item.availability } : { ...empty })
    setFormError('')
  }
  function change(key, value) { setForm(current => ({ ...current, [key]: value })); setFormError('') }
  async function save(event) {
    event.preventDefault()
    if (saving || !validation.validate()) return
    return confirm(editing?._id ? 'Are you sure you want to update this information?' : 'Are you sure you want to create this mechanic account?', async () => {
      setSaving(true)
      try {
        const data = { fullName: form.fullName.trim(), email: form.email.trim(), phone: normalizeMobile(form.phone), status: form.status, availability: form.availability }
        if (editing?._id) {
          await api.patch(`/mechanics/${editing._id}`, data)
          setNoticeSeverity('success'); setNotice('Mechanic information updated successfully.')
        } else {
          const { data: result } = await api.post('/mechanics', data)
          setNoticeSeverity(result.emailSent ? 'success' : 'warning'); setNotice(result.message)
        }
        setEditing(null); reload()
      } catch (requestError) { validation.receive(requestError); setFormError(requestError.response?.data?.errors ? '' : message(requestError)) }
      finally { setSaving(false) }
    })
  }
  async function toggleArchive() {
    if (saving || !archiveTarget) return
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
    {notice && <Alert severity={noticeSeverity} onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderColor: 'var(--line)', borderRadius: 2.5 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2.5 }}>
        <TextField label="Search mechanics" size="small" value={search} slotProps={{ htmlInput: { maxLength: 100 } }} onChange={event => setSearch(event.target.value)} sx={{ flex: 1 }} />
        <TextField select label="Records" size="small" value={archive} onChange={event => setArchive(event.target.value)} sx={{ minWidth: 130 }}><MenuItem value="active">Current</MenuItem><MenuItem value="archived">Archived</MenuItem><MenuItem value="all">All</MenuItem></TextField>
        <TextField select label="Account" size="small" value={status} onChange={event => setStatus(event.target.value)} sx={{ minWidth: 125 }}><MenuItem value="all">All statuses</MenuItem><MenuItem value="active">Active</MenuItem><MenuItem value="inactive">Inactive</MenuItem></TextField>
        <TextField select label="Availability" size="small" value={availabilityFilter} onChange={event => setAvailabilityFilter(event.target.value)} sx={{ minWidth: 135 }}><MenuItem value="all">Any</MenuItem>{availability.map(value => <MenuItem key={value} value={value}>{mechanicAvailabilityLabel(value)}</MenuItem>)}</TextField>
        <Button variant="contained" startIcon={<AddRounded />} onClick={() => openForm()}>Add mechanic</Button>
      </Stack>
      {loading ? <Stack alignItems="center" sx={{ py: 6 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 1 }}>Loading mechanics…</Typography></Stack>
        : items.length === 0 ? <Typography sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>No mechanics match these filters.</Typography>
          : <Stack spacing={1}>{items.map(item => <Box key={item._id} sx={{ p: 2, border: '1px solid var(--line)', borderRadius: 2, bgcolor: item.isArchived ? 'var(--surface-soft)' : 'var(--surface)', display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, alignItems: { sm: 'center' }, minWidth: 0 }}>
            <Avatar sx={{ bgcolor: 'var(--surface-soft)', color: 'var(--muted)', display: { xs: 'none', sm: 'flex' } }}>{item.fullName[0]}</Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}><Typography sx={{ fontWeight: 650, fontSize: 14 }}>{item.fullName}</Typography><Typography sx={{ color: 'text.secondary', fontSize: 12, overflowWrap: 'anywhere' }}>{item.employeeId} · {item.email}</Typography></Box>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
              <Chip size="small" label={item.isArchived ? 'Archived' : item.status} sx={{ bgcolor: item.isArchived ? 'var(--surface-soft)' : item.status === 'active' ? 'var(--green-soft)' : 'var(--amber-soft)' }} />
              {!item.isArchived && <Chip size="small" label={mechanicAvailabilityLabel(item.availability)} variant="outlined" />}
              {!item.isArchived && <Button size="small" variant="outlined" onClick={() => openForm(item)}>Edit</Button>}
              <Button size="small" color={item.isArchived ? 'primary' : 'inherit'} onClick={() => setArchiveTarget(item)}>{item.isArchived ? 'Restore' : 'Archive'}</Button>
            </Stack>
          </Box>)}</Stack>}
      <ListPagination pagination={pagination} />
    </Paper>
    <Dialog open={editing !== null} onClose={() => { if (!saving) setEditing(null) }} fullWidth maxWidth="sm" aria-labelledby="mechanic-form-title"><Box component="form" noValidate onSubmit={save}>
      <DialogTitle id="mechanic-form-title">{editing?._id ? 'Edit mechanic' : 'Add mechanic'}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        {formError && <Alert severity="error">{formError}</Alert>}
        <TextField label="Full name" required value={form.fullName} {...validation.field('fullName')} onChange={event => change('fullName', event.target.value)} />
        <TextField label="Email" type="email" required value={form.email} {...validation.field('email')} onChange={event => change('email', event.target.value)} />
        {editing?._id && <TextField label="Employee ID" value={editing.employeeId} slotProps={{ input: { readOnly: true } }} />}
        <TextField label="Phone Number" type="tel" required value={form.phone} {...validation.field('phone', REGISTRATION_MOBILE_HINT)}
          slotProps={{ htmlInput: { maxLength: 13, inputMode: 'tel' } }}
          onChange={event => change('phone', restrictMobileInput(event.target.value))} />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField select label="Account status" value={form.status} {...validation.field('status')} onChange={event => change('status', event.target.value)} fullWidth><MenuItem value="active">Active</MenuItem><MenuItem value="inactive">Inactive</MenuItem></TextField>
          <TextField select label="Availability" value={form.availability} {...validation.field('availability')} onChange={event => change('availability', event.target.value)} fullWidth>{availability.map(value => <MenuItem key={value} value={value}>{mechanicAvailabilityLabel(value)}</MenuItem>)}</TextField>
        </Stack>
      </Stack></DialogContent><DialogActions sx={{ p: 2.5 }}><Button disabled={saving} onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={saving} variant="contained">{saving ? 'Saving…' : 'Save'}</Button></DialogActions>
    </Box></Dialog>
    <ConfirmationDialog open={Boolean(archiveTarget)} busy={saving} onCancel={() => setArchiveTarget(null)} onConfirm={toggleArchive}
      message={archiveTarget?.isArchived ? 'Are you sure you want to restore this mechanic?' : 'Are you sure you want to archive this mechanic?'}
      details="Historical records are retained. Unfinished assignments prevent archiving." />
  </>
}
