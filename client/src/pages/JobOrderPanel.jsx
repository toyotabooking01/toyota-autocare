import { useState } from 'react'
import { Alert, Box, Button, Checkbox, CircularProgress, Divider, FormControlLabel, Stack, TextField, Typography } from '@mui/material'
import StatusChip from '../components/StatusChip'
import api from '../services/api'
import { message } from './useCatalog'
import { dateLabel } from './bookingDisplay'
import { vehicleName } from './jobOrderDisplay'

const nextAction = {
  mechanic_assigned: { role: 'mechanic', path: 'start', label: 'Start Service' },
  in_service: { role: 'mechanic', path: 'final-inspection', label: 'Mark for Final Inspection' },
  final_inspection: { role: 'admin', path: 'ready-for-release', label: 'Ready for Release' },
  ready_for_release: { role: 'admin', path: 'complete', label: 'Complete Service' },
}
export default function JobOrderPanel({ job, role, onChanged }) {
  const [notes, setNotes] = useState(job.mechanicNotes || '')
  const [checklist, setChecklist] = useState(job.serviceChecklist || [])
  const [newItem, setNewItem] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirm, setConfirm] = useState(false)
  const status = job.booking?.status
  const action = nextAction[status]?.role === role ? nextAction[status] : null
  const editable = role === 'mechanic' && status === 'in_service' && job.status === 'in_progress'
  const unsaved = editable && (notes !== (job.mechanicNotes || '') || JSON.stringify(checklist) !== JSON.stringify(job.serviceChecklist || []))
  function updateItem(index, checked) { setChecklist(current => current.map((item, at) => at === index ? { ...item, isCompleted: checked } : item)) }
  function addItem() {
    const description = newItem.trim()
    if (!description || description.length > 500 || checklist.length >= 30) return
    setChecklist(current => [...current, { description, isCompleted: false }]); setNewItem('')
  }
  async function saveWork() {
    setSaving(true); setError(''); setNotice('')
    try {
      const response = await api.put(`/job-orders/${job._id}/work`, { mechanicNotes: notes, serviceChecklist: checklist })
      onChanged(response.data.item, 'Service notes and checklist saved.')
    } catch (requestError) { setError(message(requestError)) }
    finally { setSaving(false) }
  }
  async function advance() {
    if (!action) return
    setSaving(true); setError(''); setNotice('')
    try {
      const response = await api.post(`/job-orders/${job._id}/${action.path}`)
      setConfirm(false); onChanged(response.data.item, `${action.label} recorded.`)
    } catch (requestError) { setError(message(requestError)); setConfirm(false) }
    finally { setSaving(false) }
  }
  return <Stack spacing={2} sx={{ minWidth: 0 }}>
    {error && <Alert severity="error">{error}</Alert>}
    {notice && <Alert severity="success">{notice}</Alert>}
    <Typography sx={{ fontSize: 12, color: 'text.secondary', overflowWrap: 'anywhere' }}>Job Order {job._id}</Typography>
    <Box><StatusChip status={status} /> <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary', ml: 1 }}>Job Order: {job.status?.replace('_', ' ')}</Typography></Box>
    <Divider />
    <Box><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Vehicle</Typography><Typography sx={{ fontSize: 14, fontWeight: 650 }}>{vehicleName(job.booking?.vehicle)}</Typography></Box>
    <Box><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Customer</Typography><Typography sx={{ fontSize: 13 }}>{job.booking?.client?.fullName || 'Unavailable'}</Typography></Box>
    <Box><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Booked services</Typography><Typography sx={{ fontSize: 13 }}>{job.booking?.services?.map(item => item?.name || 'Unavailable service').join(', ') || 'Unavailable'}</Typography></Box>
    <Box><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Schedule</Typography><Typography sx={{ fontSize: 13 }}>{job.booking ? `${dateLabel(job.booking.bookingDate)} · ${job.booking.bookingTime}` : 'Unavailable'}</Typography></Box>
    <Box><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Assignment</Typography><Typography sx={{ fontSize: 13 }}>{job.mechanic?.fullName || 'Mechanic unavailable'} · {job.serviceBay?.name || 'Bay unavailable'}</Typography></Box>
    {job.customerConcern && <Box><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Customer concern</Typography><Typography sx={{ fontSize: 13 }}>{job.customerConcern}</Typography></Box>}
    <Divider />
    <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Service notes & checklist</Typography>
    {editable ? <>
      <TextField label="Service notes" multiline minRows={3} value={notes} onChange={event => setNotes(event.target.value)} inputProps={{ maxLength: 5000 }} fullWidth />
      {checklist.map((item, index) => <Stack key={`${index}-${item.description}`} direction="row" alignItems="center" spacing={1}>
        <FormControlLabel sx={{ flex: 1, mr: 0 }} control={<Checkbox checked={item.isCompleted} onChange={event => updateItem(index, event.target.checked)} />} label={item.description} />
        <Button size="small" color="inherit" onClick={() => setChecklist(current => current.filter((_, at) => at !== index))}>Remove</Button>
      </Stack>)}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><TextField size="small" label="Checklist item" value={newItem} onChange={event => setNewItem(event.target.value)} inputProps={{ maxLength: 500 }} fullWidth /><Button variant="outlined" disabled={!newItem.trim() || checklist.length >= 30} onClick={addItem}>Add</Button></Stack>
      <Button variant="outlined" disabled={saving} onClick={saveWork} sx={{ alignSelf: 'flex-start' }}>{saving ? <CircularProgress size={20} /> : 'Save notes & checklist'}</Button>
    </> : <>
      <Typography sx={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{job.mechanicNotes || 'No service notes yet.'}</Typography>
      {job.serviceChecklist?.length ? <Stack>{job.serviceChecklist.map((item, index) => <Typography key={`${index}-${item.description}`} sx={{ fontSize: 13 }}>{item.isCompleted ? '✓' : '○'} {item.description}</Typography>)}</Stack> : <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>No checklist items yet.</Typography>}
    </>}
    {action && <><Divider />{unsaved && <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Save notes and checklist changes before marking for final inspection.</Typography>}<Button variant="contained" disabled={saving || unsaved} onClick={() => setConfirm(true)} sx={{ alignSelf: 'flex-start' }}>{action.label}</Button>
      {confirm && <Alert severity="warning" action={<Stack direction="row" spacing={1}><Button size="small" disabled={saving} onClick={() => setConfirm(false)}>Back</Button><Button size="small" variant="contained" disabled={saving} onClick={advance}>Confirm</Button></Stack>}>Confirm {action.label.toLowerCase()}?</Alert>}
    </>}
  </Stack>
}
