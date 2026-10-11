import ConfirmationDialog from '../components/ConfirmationDialog'
import { useConfirmation } from '../components/ConfirmationContext'
import useFormValidation from '../components/useFormValidation'
import { useState } from 'react'
import { Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import CalendarMonthRounded from '@mui/icons-material/CalendarMonthRounded'
import api from '../services/api'
import { PageHeading } from '../components/DashboardParts'
import useCatalog, { message } from './useCatalog'
import ListPagination from '../components/ListPagination'
import { dateLabel, futureSlot, remaining } from './bookingDisplay'

const emptyEdit = { date: '', timeSlot: '', maximumCapacity: '', openingTime: '', closingTime: '' }
const week = [{ value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' }, { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' }, { value: 0, label: 'Sun' }]
function todayManila() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
const emptyGenerator = () => ({ startDate: todayManila(), endDate: '', workingDays: [1, 2, 3, 4, 5, 6], openingTime: '08:00', closingTime: '17:00', slotIntervalMinutes: '60', maximumCapacity: '5' })

export default function AdminSchedules() {
  const confirm = useConfirmation()
  const [search, setSearch] = useState('')
  const [date, setDate] = useState('')
  const [enabled, setEnabled] = useState('all')
  const { items, loading, error, setError, fieldErrors, reload, pagination } = useCatalog('/schedules', { search, date, enabled }, true)
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyEdit)
  const [formError, setFormError] = useState('')
  const validation = useFormValidation('schedule', form, { schedule: editing })
  const [generatorOpen, setGeneratorOpen] = useState(false)
  const [generator, setGenerator] = useState(emptyGenerator)
  const [generatorError, setGeneratorError] = useState('')
  const [saving, setSaving] = useState(false)
  const [toggleTarget, setToggleTarget] = useState(null)

  function openEdit(item) {
    validation.reset(); setEditing(item)
    setForm({ date: item.date, timeSlot: item.timeSlot, maximumCapacity: String(item.maximumCapacity), openingTime: item.openingTime || '', closingTime: item.closingTime || '' })
    setFormError('')
  }
  function change(key, value) { setForm(current => ({ ...current, [key]: value })); setFormError('') }
  async function save(event) {
    event.preventDefault()
    if (saving || !validation.validate()) return
    setSaving(true)
    try {
      const data = { date: form.date, timeSlot: form.timeSlot, maximumCapacity: Number(form.maximumCapacity),
        ...(form.openingTime && form.closingTime ? { openingTime: form.openingTime, closingTime: form.closingTime } : {}) }
      await api.patch(`/schedules/${editing._id}`, data)
      setEditing(null); setNotice('Schedule updated.'); reload()
    } catch (requestError) { validation.receive(requestError); setFormError(requestError.response?.data?.errors ? '' : message(requestError)) }
    finally { setSaving(false) }
  }
  function toggleDay(day) {
    setGenerator(current => ({ ...current, workingDays: current.workingDays.includes(day)
      ? current.workingDays.filter(value => value !== day) : [...current.workingDays, day] }))
    setGeneratorError('')
  }
  async function generate(event) {
    event.preventDefault()
    if (saving) return
    if (!generator.startDate || !generator.endDate || generator.startDate < todayManila() || generator.endDate < generator.startDate
      || !generator.workingDays.length || !generator.openingTime || !generator.closingTime || generator.closingTime <= generator.openingTime
      || !Number.isInteger(Number(generator.slotIntervalMinutes)) || Number(generator.slotIntervalMinutes) < 15 || Number(generator.slotIntervalMinutes) > 240
      || !Number.isInteger(Number(generator.maximumCapacity)) || Number(generator.maximumCapacity) < 1) {
      setGeneratorError('Check the dates, working days, hours, interval, and capacity.'); return
    }
    await confirm('Are you sure you want to generate these schedules?', async () => {
      setSaving(true); setGeneratorError('')
      try {
        const { data } = await api.post('/schedules/generate', { ...generator, slotIntervalMinutes: Number(generator.slotIntervalMinutes), maximumCapacity: Number(generator.maximumCapacity) })
        setGeneratorOpen(false); setNotice(`${data.generatedCount} schedule slots generated. ${data.existingCount} existing slots were kept.`); reload()
      } catch (requestError) { setGeneratorError(message(requestError)) }
      finally { setSaving(false) }
    })
  }
  async function toggle() {
    if (saving || !toggleTarget) return
    const item = toggleTarget; setSaving(true)
    try {
      await api.patch(`/schedules/${item._id}/enabled`, { isEnabled: !item.isEnabled })
      setToggleTarget(null); setNotice(`Schedule ${item.isEnabled ? 'deactivated' : 'activated'}.`); reload()
    } catch (requestError) { setError(message(requestError)); setToggleTarget(null) }
    finally { setSaving(false) }
  }

  return <>
    <PageHeading title="Schedules" subtitle="Generate working slots and manage capacity." preview={false} />
    {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderColor: 'var(--line)', borderRadius: 2.5 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2.5 }}>
        <TextField size="small" label="Search date or time" value={search} slotProps={{ htmlInput: { maxLength: 100 } }} onChange={event => setSearch(event.target.value)} sx={{ flex: 1 }} />
        <TextField size="small" label="Filter date" type="date" value={date} error={Boolean(fieldErrors.date)} helperText={fieldErrors.date} onChange={event => setDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={{ minWidth: 160 }} />
        <TextField size="small" select label="Status" value={enabled} onChange={event => setEnabled(event.target.value)} sx={{ minWidth: 145 }}><MenuItem value="all">All</MenuItem><MenuItem value="true">Enabled</MenuItem><MenuItem value="false">Disabled</MenuItem></TextField>
        <Button variant="contained" startIcon={<CalendarMonthRounded />} onClick={() => { setGenerator(emptyGenerator()); setGeneratorError(''); setGeneratorOpen(true) }}>Generate Schedule</Button>
      </Stack>
      {loading ? <Stack alignItems="center" sx={{ py: 6 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 1 }}>Loading schedules…</Typography></Stack>
        : !items.length ? <Typography sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>No schedules match these filters.</Typography>
          : <Stack spacing={1}>{items.map(item => {
            const future = futureSlot(item); const left = remaining(item)
            const state = !item.isEnabled ? 'Disabled' : !future ? 'Past' : left === 0 ? 'Full' : 'Available'
            return <Box key={item._id} sx={{ p: 2, border: '1px solid var(--line)', borderRadius: 2, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' }, gap: 2, minWidth: 0 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}><Typography sx={{ fontWeight: 650, fontSize: 14 }}>{dateLabel(item.date)} · {item.timeSlot}</Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: .5 }}>Capacity {item.maximumCapacity} · Booked {item.currentBookingCount} · Remaining {left}
                  {item.openingTime && item.closingTime ? ` · ${item.openingTime}–${item.closingTime}` : ' · Legacy hours'}</Typography></Box>
              <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap"><Chip size="small" label={state} sx={{ bgcolor: state === 'Available' ? 'var(--green-soft)' : 'var(--surface-soft)' }} />
                {future && <Button size="small" variant="outlined" onClick={() => openEdit(item)}>Edit</Button>}
                {(future || item.isEnabled) && <Button size="small" color="inherit" onClick={() => setToggleTarget(item)}>{item.isEnabled ? 'Deactivate' : 'Activate'}</Button>}
              </Stack>
            </Box>
          })}</Stack>}
      <ListPagination pagination={pagination} />
    </Paper>
    <Dialog open={generatorOpen} onClose={() => { if (!saving) setGeneratorOpen(false) }} fullWidth maxWidth="sm" aria-labelledby="schedule-generator-title">
      <Box component="form" noValidate onSubmit={generate}><DialogTitle id="schedule-generator-title">Generate Schedule</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        {generatorError && <Alert severity="error">{generatorError}</Alert>}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <TextField fullWidth label="Start date" type="date" required value={generator.startDate} onChange={event => setGenerator({ ...generator, startDate: event.target.value })} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: todayManila() } }} />
          <TextField fullWidth label="End date" type="date" required value={generator.endDate} onChange={event => setGenerator({ ...generator, endDate: event.target.value })} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: generator.startDate || todayManila() } }} />
        </Stack>
        <Box><Typography sx={{ fontSize: 13, fontWeight: 650, mb: .5 }}>Working days</Typography><Stack direction="row" useFlexGap flexWrap="wrap" gap={.5}>
          {week.map(day => <FormControlLabel key={day.value} control={<Checkbox checked={generator.workingDays.includes(day.value)} onChange={() => toggleDay(day.value)} disabled={saving} />} label={day.label} sx={{ mr: 1 }} />)}
        </Stack></Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <TextField fullWidth label="Opening time" type="time" required value={generator.openingTime} onChange={event => setGenerator({ ...generator, openingTime: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField fullWidth label="Closing time" type="time" required value={generator.closingTime} onChange={event => setGenerator({ ...generator, closingTime: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <TextField fullWidth select label="Slot interval" value={generator.slotIntervalMinutes} onChange={event => setGenerator({ ...generator, slotIntervalMinutes: event.target.value })}>{[30, 60, 90, 120, 180, 240].map(value => <MenuItem key={value} value={String(value)}>{value} minutes</MenuItem>)}</TextField>
          <TextField fullWidth label="Default capacity" type="number" required value={generator.maximumCapacity} onChange={event => setGenerator({ ...generator, maximumCapacity: event.target.value })} slotProps={{ htmlInput: { min: 1, max: 1000, step: 1 } }} />
        </Stack>
        <Typography sx={{ color: 'text.secondary', fontSize: 12 }}>Existing slots are kept and will not be duplicated.</Typography>
      </Stack></DialogContent><DialogActions sx={{ p: 2.5 }}><Button disabled={saving} onClick={() => setGeneratorOpen(false)}>Cancel</Button><Button type="submit" disabled={saving} variant="contained">{saving ? 'Generating…' : 'Generate Schedule'}</Button></DialogActions></Box>
    </Dialog>
    <Dialog open={editing !== null} onClose={() => { if (!saving) setEditing(null) }} fullWidth maxWidth="sm" aria-labelledby="schedule-edit-title"><Box component="form" noValidate onSubmit={save}>
      <DialogTitle id="schedule-edit-title">Edit future schedule</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        {formError && <Alert severity="error">{formError}</Alert>}
        <TextField label="Date" type="date" required value={form.date} {...validation.field('date')} onChange={event => change('date', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField label="Start time" type="time" required value={form.timeSlot} {...validation.field('timeSlot')} onChange={event => change('timeSlot', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <TextField label="Opening time (optional)" type="time" value={form.openingTime} onChange={event => change('openingTime', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField label="Closing time (optional)" type="time" value={form.closingTime} onChange={event => change('closingTime', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </Stack>
        <TextField label="Maximum capacity" type="number" required value={form.maximumCapacity} {...validation.field('maximumCapacity')} onChange={event => change('maximumCapacity', event.target.value)} slotProps={{ htmlInput: { min: 1, step: 1 } }} />
      </Stack></DialogContent><DialogActions sx={{ p: 2.5 }}><Button disabled={saving} onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={saving} variant="contained">{saving ? 'Saving…' : 'Save changes'}</Button></DialogActions>
    </Box></Dialog>
    <ConfirmationDialog open={Boolean(toggleTarget)} busy={saving} onCancel={() => setToggleTarget(null)} onConfirm={toggle}
      message={`Are you sure you want to ${toggleTarget?.isEnabled ? 'deactivate' : 'activate'} this schedule?`}
      details={toggleTarget?.isEnabled ? 'Existing bookings remain. No new bookings will be admitted to this slot.' : 'Clients can book this slot while capacity remains.'} />
  </>
}
