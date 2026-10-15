import { DetailFooter, DetailGrid, DetailInfo, DetailSection, DetailVehicle, ServiceEstimate } from '../components/RecordDetails'
import { RecordCard, RecordActions } from '../components/RecordList'
import { vehicleName } from './jobOrderDisplay'
import { useConfirmation } from '../components/ConfirmationContext'
import useFormValidation from '../components/useFormValidation'
import { useState } from 'react'
import { Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, Stack, TextField, Typography } from '@mui/material'
import StatusChip from '../components/StatusChip'
import api from '../services/api'
import { message } from './useCatalog'
import { dateLabel } from './bookingDisplay'
import DirectionsCarOutlined from '@mui/icons-material/DirectionsCarOutlined'
import PersonOutlined from '@mui/icons-material/PersonOutlined'
import BuildOutlined from '@mui/icons-material/BuildOutlined'
import PaymentPanel from '../components/PaymentPanel'
import { releaseBlockReason } from '../utils/paymentRelease'

const sectionIcon = Icon => <Icon sx={{ fontSize: 16, verticalAlign: '-3px', mr: .75, color: 'text.secondary' }} />

const nextAction = {
  mechanic_assigned: { role: 'mechanic', path: 'start', label: 'Start Service' },
  in_service: { role: 'mechanic', path: 'final-inspection', label: 'Mark for Final Inspection' },
  final_inspection: { role: 'staff', path: 'ready-for-release', label: 'Ready for Release' },
  ready_for_release: { role: 'staff', path: 'complete', label: 'Complete Service' },
}
export default function JobOrderPanel({ job, role, onChanged, showHeader = true, compact = false }) {
  const confirm = useConfirmation()
  const [notes, setNotes] = useState(job.mechanicNotes || '')
  const [checklist, setChecklist] = useState(job.serviceChecklist || [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const validation = useFormValidation('work', { mechanicNotes: notes, serviceChecklist: checklist })
  const [notice, setNotice] = useState('')
  const [paymentSummary, setPaymentSummary] = useState(null)
  const [duration, setDuration] = useState(String(job.estimatedDurationMinutes || job.booking?.estimatedDurationMinutes || ''))
  const [durationError, setDurationError] = useState('')
  const status = job.booking?.status
  const next = nextAction[status]
  const action = next && (role === 'admin' || next.role === role)
    && job.status === (status === 'mechanic_assigned' ? 'pending' : 'in_progress')
    && (status !== 'ready_for_release' || job.startedAt) ? next : null
  const downpaymentBlock = action?.path === 'ready-for-release'
    ? !paymentSummary ? 'Loading authoritative payment summary.'
      : paymentSummary.payments?.some(item => item.stage === 'downpayment' && item.status === 'submitted')
        ? 'Verify or reject the submitted downpayment before marking ready for release.' : '' : ''
  const editable = ['mechanic', 'admin'].includes(role) && status === 'in_service' && job.status === 'in_progress'
  const unsaved = editable && (notes !== (job.mechanicNotes || '') || JSON.stringify(checklist) !== JSON.stringify(job.serviceChecklist || []))
  const estimatedDuration = job.estimatedDurationMinutes || job.booking?.estimatedDurationMinutes
    || job.booking?.services?.reduce((total, service) => total + Number(service?.estimatedDuration || 0), 0) || 0
  const canAdjustDuration = ['staff', 'mechanic', 'admin'].includes(role) && ['pending', 'in_progress'].includes(job.status)
    && ['mechanic_assigned', 'in_service'].includes(status)
  const completedChecklistCount = checklist.filter(item => item.isCompleted).length
  const checklistIncomplete = job.checklistRequired === true && checklist.length > 0 && completedChecklistCount < checklist.length
  const checklistGroups = checklist.reduce((groups, item, index) => {
    const key = item.serviceId ? String(item.serviceId) : item.serviceName || 'service-checklist'
    let group = groups.find(entry => entry.key === key)
    if (!group) { group = { key, name: item.serviceName || 'Service checklist', items: [] }; groups.push(group) }
    group.items.push({ ...item, index })
    return groups
  }, [])
  const checklistContent = checklist.length ? <Stack spacing={compact ? 1 : 1.5} sx={{ minWidth: 0 }}>
    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{completedChecklistCount} of {checklist.length} completed</Typography>
    {checklistGroups.map(group => <Box key={group.key} sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary', mb: compact ? .5 : .25 }}>{group.name}</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: compact ? { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' } : 'minmax(0, 1fr)', columnGap: 1.5, rowGap: compact ? .25 : .75 }}>
        {group.items.map(item => editable ? <FormControlLabel key={`${group.key}-${item.index}`} sx={{ display: 'flex', mr: 0, ml: 0, minWidth: 0,
          '& .MuiFormControlLabel-label': { minWidth: 0 }, '& .MuiCheckbox-root': { p: compact ? .5 : 1 } }}
          control={<Checkbox size={compact ? 'small' : 'medium'} checked={item.isCompleted} disabled={saving} onChange={event => updateItem(item.index, event.target.checked)} />}
          label={<Typography sx={{ fontSize: 13, overflowWrap: 'anywhere' }}>{item.description}</Typography>} />
          : <Typography key={`${group.key}-${item.index}`} sx={{ fontSize: 13, overflowWrap: 'anywhere', py: compact ? .5 : 0 }}>{item.isCompleted ? '✓' : '○'} {item.description}</Typography>)}
      </Box>
    </Box>)}
  </Stack> : <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>No checklist items are configured for these services.</Typography>
  function updateItem(index, checked) { setChecklist(current => current.map((item, at) => at === index ? { ...item, isCompleted: checked } : item)) }
  async function saveWork() {
    if (saving || !validation.validate()) return
    return confirm('Are you sure you want to save these changes?', async () => {
      setSaving(true); setError(''); setNotice('')
      try {
        const response = await api.put(`/job-orders/${job._id}/work`, { mechanicNotes: notes,
          serviceChecklist: checklist.map(({ description, isCompleted }) => ({ description, isCompleted })) })
        onChanged(response.data.item, 'Service notes and checklist saved.')
      } catch (requestError) { validation.receive(requestError); setError(requestError.response?.data?.errors ? '' : message(requestError)) }
      finally { setSaving(false) }
    })
  }
  async function advance() {
    if (!action || saving || unsaved) return
    if (downpaymentBlock) { setError(downpaymentBlock); return }
    if (action.path === 'complete' && releaseBlockReason(paymentSummary)) {
      setError(releaseBlockReason(paymentSummary))
      return
    }
    if (action.path === 'final-inspection' && checklistIncomplete) {
      setError('Complete and save all checklist items before final inspection.')
      return
    }
    return confirm(`Are you sure you want to ${action.label.toLowerCase()}?`, async () => {
      setSaving(true); setError(''); setNotice('')
      try {
        const response = await api.post(`/job-orders/${job._id}/${action.path}`)
        onChanged(response.data.item, `${action.label} recorded.`)
      } catch (requestError) { setError(message(requestError)) }
      finally { setSaving(false) }
    })
  }
  async function saveDuration() {
    const value = Number(duration)
    if (!Number.isSafeInteger(value) || value < 1 || value > 10080) {
      setDurationError('Enter a whole number of minutes from 1 to 10,080.')
      return
    }
    if (saving) return
    return confirm('Are you sure you want to update the estimated service duration?', async () => {
      setSaving(true); setError(''); setDurationError(''); setNotice('')
      try {
        const response = await api.patch(`/job-orders/${job._id}/duration`, { estimatedDurationMinutes: value })
        onChanged(response.data.item, response.data.changed === false ? 'The estimate is already up to date.' : 'Estimated service duration updated.')
      } catch (requestError) {
        const fieldError = requestError.response?.data?.errors?.estimatedDurationMinutes
        setDurationError(fieldError || '')
        if (!fieldError) setError(message(requestError))
      } finally { setSaving(false) }
    })
  }
  return <Stack className="record-details" spacing={compact ? 0 : 2} sx={{ minWidth: 0, width: '100%', ...(compact ? {
    gap: { xs: 1.5, md: 1.75 }, '& .detail-section': { p: { xs: 1.75, md: 2 }, borderRadius: '13px', bgcolor: 'var(--surface)' },
    '& .detail-section > h3': { mb: 1 }, '& .detail-grid': { gap: { xs: 1.5, md: 1.75 }, alignItems: 'stretch' },
    '& .detail-grid > .detail-section': { height: '100%' },
  } : {}) }}>
    {showHeader && !compact && <Box sx={{ containerType: 'inline-size' }}><RecordCard>
      <Box className="record-card-copy"><Typography>{vehicleName(job.booking?.vehicle)}</Typography>
        <Typography>{job.booking && `${dateLabel(job.booking.bookingDate)} · ${job.booking.bookingTime}`} · {job.serviceBay?.name || 'Bay unavailable'}</Typography>
        <Typography>Job Order {job._id}</Typography></Box>
      <RecordActions statuses={<StatusChip status={status} />} />
    </RecordCard></Box>}
    {error && <Alert severity="error">{error}</Alert>}
    {notice && <Alert severity="success">{notice}</Alert>}
    <DetailSection title="Job overview">
      <DetailInfo items={[
        ['Job Order status', compact ? <StatusChip status={job.status === 'in_progress' ? status : job.status} /> : job.status?.replaceAll('_', ' ')],
        ['Schedule', job.booking ? `${dateLabel(job.booking.bookingDate)} · ${job.booking.bookingTime}` : null],
        ['Assigned mechanic', job.mechanic?.fullName], ['Bay', job.serviceBay?.name],
      ]} />
      {compact && <Typography sx={{ mt: 1, fontSize: 11, color: 'text.secondary', overflowWrap: 'anywhere' }}>Job Order {job._id}</Typography>}
    </DetailSection>
    {job.activity?.length > 0 && !compact && <DetailSection title="Activity"><DetailInfo items={job.activity.slice(-8).reverse().map(entry => [entry.action.replaceAll('_', ' ').replaceAll('-', ' '), `${entry.performedBy?.fullName || 'User'} (${entry.performedByRole}) · ${new Date(entry.performedAt).toLocaleString()}`])} /></DetailSection>}
    <DetailGrid>
      <DetailSection title={compact ? <>{sectionIcon(DirectionsCarOutlined)}Vehicle</> : 'Vehicle'}><DetailVehicle vehicle={job.booking?.vehicle} /></DetailSection>
      <DetailSection title={compact ? <>{sectionIcon(PersonOutlined)}Customer</> : 'Customer'}><DetailInfo items={[["Customer", job.booking?.client?.fullName]]} /></DetailSection>
    </DetailGrid>
    {job.customerConcern && !compact && <DetailSection title="Customer concern"><DetailInfo items={[["Concern", job.customerConcern]]} /></DetailSection>}
    <DetailGrid>
      <ServiceEstimate services={job.booking?.services} />
      <DetailSection title={compact ? <>{sectionIcon(BuildOutlined)}Service progress</> : 'Service progress'}>
    <Box><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Estimated service duration</Typography>
      <Typography sx={{ fontSize: 13 }}>{estimatedDuration ? `Current estimate: ${estimatedDuration} minutes` : 'Current estimate: Not recorded'}</Typography>
      {job.booking?.initialEstimatedDurationMinutes && job.booking.initialEstimatedDurationMinutes !== estimatedDuration
        && <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Original estimate: {job.booking.initialEstimatedDurationMinutes} minutes</Typography>}
      {canAdjustDuration && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'flex-start' }} sx={{ mt: compact ? 1 : .5 }}>
        <TextField size="small" type="number" label="Minutes" value={duration} error={Boolean(durationError)} helperText={durationError || 'Whole minutes'} disabled={saving} sx={compact ? { width: 150, maxWidth: '100%' } : undefined}
          onChange={event => { setDuration(event.target.value); setDurationError('') }} slotProps={{ htmlInput: { min: 1, max: 10080, step: 1, inputMode: 'numeric' } }} />
      </Stack>}
    </Box>
    {job.actualDurationMinutes != null && <Box><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Actual service duration</Typography><Typography sx={{ fontSize: 13 }}>{job.actualDurationMinutes} minutes</Typography></Box>}
      </DetailSection>
    </DetailGrid>
    {job.booking?._id && ['staff', 'admin'].includes(role) && ['final_inspection', 'ready_for_release', 'completed'].includes(status) && <PaymentPanel bookingId={job.booking._id}
      bookingStatus={status} role={role} onSummary={setPaymentSummary} />}
    <DetailSection title="Service notes & checklist">
      <Box sx={compact ? { display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(180px, .72fr) minmax(0, 1.28fr)' }, gap: { xs: 1.5, md: 2 }, alignItems: 'start' } : { display: 'grid', gap: 1.5 }}>
        <Box sx={{ minWidth: 0 }}>
          {job.customerConcern && compact && <Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 1 }}>Customer concern: {job.customerConcern}</Typography>}
          {editable ? <TextField label="Service notes" multiline minRows={compact ? 2 : 3} value={notes} {...validation.field('mechanicNotes')} onChange={event => setNotes(event.target.value)} slotProps={{ htmlInput: { maxLength: 5000 } }} fullWidth />
            : <Typography sx={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{job.mechanicNotes || 'No service notes yet.'}</Typography>}
        </Box>
        {checklistContent}
      </Box>
    </DetailSection>
    {job.activity?.length > 0 && compact && <Box component="details" sx={{ fontSize: 12, color: 'text.secondary', px: .5, '& summary': { cursor: 'pointer', width: 'fit-content' } }}><Box component="summary">Job activity</Box><Box sx={{ mt: 1 }}><DetailInfo items={job.activity.slice(-8).reverse().map(entry => [entry.action.replaceAll('_', ' ').replaceAll('-', ' '), `${entry.performedBy?.fullName || 'User'} (${entry.performedByRole}) · ${new Date(entry.performedAt).toLocaleString()}`])} /></Box></Box>}
    {action && unsaved && <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Save notes and checklist changes before marking for final inspection.</Typography>}
    {action?.path === 'final-inspection' && checklistIncomplete && <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Complete all checklist items and save your progress before final inspection.</Typography>}
    {downpaymentBlock && <Typography role="status" sx={{ fontSize: 12, color: 'text.secondary' }}>{downpaymentBlock}</Typography>}
    {action?.path === 'complete' && releaseBlockReason(paymentSummary) && <Typography role="status" sx={{ fontSize: 12, color: 'text.secondary' }}>{releaseBlockReason(paymentSummary)}</Typography>}
    {(canAdjustDuration || editable || action) && <Box sx={compact ? { '& .detail-footer': { mt: 0, pt: 2, pb: 1, gap: 1 } } : undefined}><DetailFooter>
      {canAdjustDuration && <Button variant="outlined" disabled={saving || !duration} onClick={saveDuration}>{saving ? <CircularProgress size={18} /> : 'Update estimate'}</Button>}
      {editable && <Button variant={action ? 'outlined' : 'contained'} disabled={saving} onClick={saveWork}>{saving ? <CircularProgress size={20} /> : 'Save notes & checklist'}</Button>}
      {action && <Button variant="contained" disabled={saving || unsaved || Boolean(downpaymentBlock) || (action.path === 'final-inspection' && checklistIncomplete)
        || (action.path === 'complete' && Boolean(releaseBlockReason(paymentSummary)))} onClick={advance}>{action.path === 'complete' ? 'Release Vehicle / Complete' : action.label}</Button>}
    </DetailFooter></Box>}
  </Stack>
}
