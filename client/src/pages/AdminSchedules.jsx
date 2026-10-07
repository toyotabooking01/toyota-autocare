import { useState } from 'react'
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import AddRounded from '@mui/icons-material/AddRounded'
import api from '../services/api'
import { PageHeading } from '../components/DashboardParts'
import useCatalog, { message } from './useCatalog'
import { dateLabel, futureSlot, remaining } from './bookingDisplay'

const blank = { date: '', timeSlot: '', maximumCapacity: '' }
function validate(form) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.timeSlot)) return 'Enter a valid date and time.'
  if (!Number.isInteger(Number(form.maximumCapacity)) || Number(form.maximumCapacity) < 1) return 'Capacity must be a positive whole number.'
  if (!futureSlot(form)) return 'The schedule must be in the future.'
  return ''
}
export default function AdminSchedules() {
  const [search, setSearch] = useState('')
  const [date, setDate] = useState('')
  const [enabled, setEnabled] = useState('all')
  const { items, loading, error, setError, reload } = useCatalog('/schedules', { search, date, enabled })
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(blank)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [toggleTarget, setToggleTarget] = useState(null)
  function openForm(item = {}) {
    setEditing(item)
    setForm(item._id ? { date: item.date, timeSlot: item.timeSlot, maximumCapacity: String(item.maximumCapacity) } : { ...blank })
    setFormError('')
  }
  function change(key, value) { setForm(current => ({ ...current, [key]: value })); setFormError('') }
  async function save(event) {
    event.preventDefault()
    const problem = validate(form)
    if (problem) { setFormError(problem); return }
    if (editing?._id && Number(form.maximumCapacity) < editing.currentBookingCount) {
      setFormError('Capacity cannot be lower than the current booked count.'); return
    }
    setSaving(true)
    try {
      const data = { date: form.date, timeSlot: form.timeSlot, maximumCapacity: Number(form.maximumCapacity) }
      if (editing?._id) await api.patch(`/schedules/${editing._id}`, data)
      else await api.post('/schedules', data)
      setEditing(null); setNotice(`Schedule ${editing?._id ? 'updated' : 'created'}.`); reload()
    } catch (requestError) { setFormError(message(requestError)) }
    finally { setSaving(false) }
  }
  async function toggle() {
    const item = toggleTarget
    setSaving(true)
    try {
      await api.patch(`/schedules/${item._id}/enabled`, { isEnabled: !item.isEnabled })
      setToggleTarget(null); setNotice(`Schedule ${item.isEnabled ? 'deactivated' : 'activated'}.`); reload()
    } catch (requestError) { setError(message(requestError)); setToggleTarget(null) }
    finally { setSaving(false) }
  }
  return <>
    <PageHeading title="Schedules" subtitle="Manage appointment slots and their capacity." preview={false} />
    {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderColor: '#e5eaf1', borderRadius: 2.5 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2.5 }}>
        <TextField size="small" label="Search date or time" value={search} onChange={event => setSearch(event.target.value)} sx={{ flex: 1 }} />
        <TextField size="small" label="Filter date" type="date" value={date} onChange={event => setDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={{ minWidth: 160 }} />
        <TextField size="small" select label="Status" value={enabled} onChange={event => setEnabled(event.target.value)} sx={{ minWidth: 145 }}><MenuItem value="all">All</MenuItem><MenuItem value="true">Enabled</MenuItem><MenuItem value="false">Disabled</MenuItem></TextField>
        <Button variant="contained" startIcon={<AddRounded />} onClick={() => openForm()}>Add slot</Button>
      </Stack>
      {loading ? <Stack alignItems="center" sx={{ py: 6 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 1 }}>Loading schedules…</Typography></Stack>
        : !items.length ? <Typography sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>No schedules match these filters.</Typography>
          : <Stack spacing={1}>{items.map(item => {
            const future = futureSlot(item)
            const left = remaining(item)
            const state = !item.isEnabled ? 'Disabled' : !future ? 'Past' : left === 0 ? 'Full' : 'Available'
            return <Box key={item._id} sx={{ p: 2, border: '1px solid #e9edf2', borderRadius: 2, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' }, gap: 2, minWidth: 0 }}>
              <Box sx={{ flex: 1 }}><Typography sx={{ fontWeight: 650, fontSize: 14 }}>{dateLabel(item.date)} · {item.timeSlot}</Typography><Typography sx={{ fontSize: 12, color: 'text.secondary', mt: .5 }}>Capacity {item.maximumCapacity} · Booked {item.currentBookingCount} · Remaining {left}</Typography></Box>
              <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap"><Chip size="small" label={state} sx={{ bgcolor: state === 'Available' ? '#eaf6ed' : '#eef0f3' }} />
                {future && <Button size="small" variant="outlined" onClick={() => openForm(item)}>Edit</Button>}
                {(future || item.isEnabled) && <Button size="small" color="inherit" onClick={() => setToggleTarget(item)}>{item.isEnabled ? 'Deactivate' : 'Activate'}</Button>}
              </Stack>
            </Box>
          })}</Stack>}
    </Paper>
    <Dialog open={editing !== null} onClose={() => { if (!saving) setEditing(null) }} fullWidth maxWidth="sm" aria-labelledby="schedule-form-title"><Box component="form" onSubmit={save}>
      <DialogTitle id="schedule-form-title">{editing?._id ? 'Edit schedule' : 'Add schedule'}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        {formError && <Alert severity="error">{formError}</Alert>}
        <TextField label="Date" type="date" required value={form.date} onChange={event => change('date', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField label="Time" type="time" required value={form.timeSlot} onChange={event => change('timeSlot', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField label="Maximum capacity" type="number" required value={form.maximumCapacity} onChange={event => change('maximumCapacity', event.target.value)} inputProps={{ min: 1, step: 1 }} helperText={editing?._id ? `Currently booked: ${editing.currentBookingCount}. Capacity cannot go below that number.` : undefined} />
      </Stack></DialogContent><DialogActions sx={{ p: 2.5 }}><Button disabled={saving} onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={saving} variant="contained">{saving ? 'Saving…' : 'Save'}</Button></DialogActions>
    </Box></Dialog>
    <Dialog open={Boolean(toggleTarget)} onClose={() => { if (!saving) setToggleTarget(null) }} aria-labelledby="schedule-toggle-title"><DialogTitle id="schedule-toggle-title">{toggleTarget?.isEnabled ? 'Deactivate' : 'Activate'} schedule?</DialogTitle><DialogContent><Typography sx={{ fontSize: 13 }}>Existing bookings remain. {toggleTarget?.isEnabled ? 'No new bookings will be admitted to this slot.' : 'Clients can book this slot while capacity remains.'}</Typography></DialogContent><DialogActions sx={{ p: 2 }}><Button disabled={saving} onClick={() => setToggleTarget(null)}>Cancel</Button><Button disabled={saving} variant="contained" onClick={toggle}>{saving ? 'Saving…' : toggleTarget?.isEnabled ? 'Deactivate' : 'Activate'}</Button></DialogActions></Dialog>
  </>
}
