import { DetailsButton, MoreActionsMenu } from '../components/RowActions'
import { MinimalStatus } from '../components/StatusChip'
import ConfirmationDialog from '../components/ConfirmationDialog'
import { useConfirmation } from '../components/ConfirmationContext'
import useFormValidation from '../components/useFormValidation'
import { useState } from 'react'
import { Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { Calendar, InfoCircle, Plus, Xmark } from 'iconoir-react'
import api from '../services/api'
import { PageHeading } from '../components/DashboardParts'
import useCatalog, { message } from './useCatalog'
import RecordList, { RecordPanel } from '../components/RecordList'
import { dateLabel, futureSlot, remaining } from './bookingDisplay'
import { DetailDialog, DetailInfo, DetailSection } from '../components/RecordDetails'

const emptyEdit = { date: '', timeSlot: '', maximumCapacity: '', openingTime: '', closingTime: '' }
const week = [{ value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' }, { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' }, { value: 0, label: 'Sun' }]
function todayManila() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
const emptyGenerator = () => ({ startDate: todayManila(), endDate: '', workingDays: [1, 2, 3, 4, 5, 6], openingTime: '08:00', closingTime: '17:00', slotIntervalMinutes: '60', maximumCapacity: '5' })

export default function AdminSchedules() {
  const [selected, setSelected] = useState(null)
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
    <RecordPanel className="schedule-directory-panel admin-list-surface">
      <Box className="schedule-directory-toolbar admin-list-toolbar">
        <TextField className="schedule-search" size="small" label="Search date or time" value={search} slotProps={{ htmlInput: { maxLength: 100 } }} onChange={event => setSearch(event.target.value)} />
        <TextField size="small" label="Filter date" type="date" value={date} error={Boolean(fieldErrors.date)} helperText={fieldErrors.date} onChange={event => setDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" select label="Status" value={enabled} onChange={event => setEnabled(event.target.value)}><MenuItem value="all">All statuses</MenuItem><MenuItem value="true">Enabled</MenuItem><MenuItem value="false">Disabled</MenuItem></TextField>
        <Button className="schedule-generate-button" variant="contained" startIcon={<Plus width={17} height={17} strokeWidth={1.8} />} onClick={() => { setGenerator(emptyGenerator()); setGeneratorError(''); setGeneratorOpen(true) }}>Generate Schedule</Button>
      </Box>
      <Box className="schedule-directory-header admin-list-header" aria-hidden="true"><span>Date &amp; time</span><span>Capacity</span><span>Booked</span><span>Remaining</span><span>Hours</span><span>Status</span><span>Details</span><span>More</span></Box>
      <RecordList className="schedule-directory-list" items={items} pagination={pagination} loading={loading && <Stack alignItems="center" sx={{ py: 6 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 1 }}>Loading schedules…</Typography></Stack>} empty="No schedules match these filters.">
        {item => {
            const future = futureSlot(item); const left = remaining(item)
            const state = !item.isEnabled ? 'Disabled' : !future ? 'Past' : left === 0 ? 'Full' : 'Available'
            const status = state === 'Available' ? 'available' : state === 'Full' ? 'busy' : state === 'Disabled' ? 'inactive' : 'past'
            return <Box key={item._id} className="schedule-directory-row admin-list-row">
              <Box className="schedule-directory-identity"><span className="schedule-directory-icon" aria-hidden="true"><Calendar width={19} height={19} strokeWidth={1.7} /></span>
                <Box sx={{ minWidth: 0 }}><Typography className="schedule-directory-date" title={`${dateLabel(item.date)} · ${item.timeSlot}`}>{dateLabel(item.date)} · {item.timeSlot}</Typography><Typography className="schedule-directory-meta">Schedule slot</Typography></Box></Box>
              <Box className="schedule-directory-metrics">
                <Box className="schedule-directory-metric"><span>Capacity</span><strong>{item.maximumCapacity}</strong></Box>
                <Box className="schedule-directory-metric"><span>Booked</span><strong>{item.currentBookingCount}</strong></Box>
                <Box className="schedule-directory-metric"><span>Remaining</span><strong>{left}</strong></Box>
              </Box>
              <Typography className="schedule-directory-hours">{item.openingTime && item.closingTime ? `${item.openingTime}–${item.closingTime}` : 'Legacy hours'}</Typography>
              <Box className="schedule-directory-state"><MinimalStatus label={state} status={status} /></Box>
              <DetailsButton className="schedule-directory-details admin-list-details" onClick={() => setSelected(item)}>Details</DetailsButton>
              <Box className="schedule-directory-more"><MoreActionsMenu label={`${item.date} ${item.timeSlot}`} disabled={saving} items={[future && { label: 'Edit', onClick: () => openEdit(item) }, (future || item.isEnabled) && { label: item.isEnabled ? 'Deactivate' : 'Activate', destructive: item.isEnabled, onClick: () => setToggleTarget(item) }]} /></Box>
            </Box>
        }}
      </RecordList>
    </RecordPanel>
    <DetailDialog className="schedule-details-dialog" open={Boolean(selected)} onClose={() => setSelected(null)} title="Schedule details" reference={selected && `${dateLabel(selected.date)} · ${selected.timeSlot}`} status={selected && <MinimalStatus label={!selected.isEnabled ? 'Disabled' : !futureSlot(selected) ? 'Past' : remaining(selected) === 0 ? 'Full' : 'Available'} status={!selected.isEnabled ? 'inactive' : !futureSlot(selected) ? 'past' : remaining(selected) === 0 ? 'busy' : 'available'} />}>
      {selected && <DetailSection title="Schedule overview"><DetailInfo items={[
        ['Date', dateLabel(selected.date)], ['Time', selected.timeSlot],
        ['Capacity', selected.maximumCapacity], ['Booked', selected.currentBookingCount], ['Remaining', remaining(selected)],
        ['Hours', selected.openingTime && selected.closingTime ? `${selected.openingTime}–${selected.closingTime}` : 'Legacy hours'],
      ]} /></DetailSection>}
    </DetailDialog>
    <Dialog className="schedule-generator-dialog" open={generatorOpen} onClose={() => { if (!saving) setGeneratorOpen(false) }} fullWidth maxWidth={false} aria-labelledby="schedule-generator-title">
      <Box component="form" noValidate onSubmit={generate}>
        <DialogTitle className="schedule-generator-title" id="schedule-generator-title"><span className="schedule-generator-mark"><Calendar width={20} height={20} strokeWidth={1.7} /></span><span><strong>Generate Schedule</strong><small>Create multiple working slots with your preferred settings.</small></span><IconButton aria-label="Close" onClick={() => { if (!saving) setGeneratorOpen(false) }} disabled={saving}><Xmark width={19} height={19} strokeWidth={1.7} /></IconButton></DialogTitle>
        <DialogContent><Stack className="schedule-generator-fields" spacing={1.5}>
          {generatorError && <Alert severity="error">{generatorError}</Alert>}
          <Box className="schedule-generator-section"><Typography className="schedule-generator-section-title">Date range</Typography><Box className="schedule-generator-grid">
            <TextField fullWidth label="Start date" type="date" required value={generator.startDate} onChange={event => setGenerator({ ...generator, startDate: event.target.value })} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: todayManila() } }} />
            <TextField fullWidth label="End date" type="date" required value={generator.endDate} onChange={event => setGenerator({ ...generator, endDate: event.target.value })} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: generator.startDate || todayManila() } }} />
          </Box></Box>
          <Box className="schedule-generator-section"><Typography className="schedule-generator-section-title">Working days</Typography><Box className="schedule-working-days">
            {week.map(day => <FormControlLabel className="schedule-working-day" key={day.value} control={<Checkbox checked={generator.workingDays.includes(day.value)} onChange={() => toggleDay(day.value)} disabled={saving} />} label={day.label} />)}
          </Box></Box>
          <Box className="schedule-generator-section"><Typography className="schedule-generator-section-title">Schedule settings</Typography><Box className="schedule-generator-grid">
            <TextField fullWidth label="Opening time" type="time" required value={generator.openingTime} onChange={event => setGenerator({ ...generator, openingTime: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField fullWidth label="Closing time" type="time" required value={generator.closingTime} onChange={event => setGenerator({ ...generator, closingTime: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField fullWidth select label="Slot interval" value={generator.slotIntervalMinutes} onChange={event => setGenerator({ ...generator, slotIntervalMinutes: event.target.value })}>{[30, 60, 90, 120, 180, 240].map(value => <MenuItem key={value} value={String(value)}>{value} minutes</MenuItem>)}</TextField>
            <TextField fullWidth label="Default capacity" type="number" required value={generator.maximumCapacity} onChange={event => setGenerator({ ...generator, maximumCapacity: event.target.value })} slotProps={{ htmlInput: { min: 1, max: 1000, step: 1 } }} />
          </Box><Box className="schedule-existing-notice"><InfoCircle width={17} height={17} strokeWidth={1.7} /><Typography>Existing slots are kept and will not be duplicated.</Typography></Box></Box>
        </Stack></DialogContent>
        <DialogActions><Button disabled={saving} onClick={() => setGeneratorOpen(false)}>Cancel</Button><Button type="submit" disabled={saving} variant="contained" startIcon={<Plus width={16} height={16} strokeWidth={1.8} />}>{saving ? 'Generating…' : 'Generate Schedule'}</Button></DialogActions>
      </Box>
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
