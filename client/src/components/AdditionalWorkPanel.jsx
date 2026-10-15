import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { DetailSection } from './RecordDetails'
import api from '../services/api'
import { money } from '../pages/bookingDisplay'
import { blocksFinalInspection, canRequestAdditionalWork, canReviewAdditionalWork,
  canDecideAdditionalWork, canPerformAdditionalWork } from '../utils/additionalWorkState'
import { evidenceError, proposalFormError } from '../utils/additionalWorkForm'

const pesos = cents => money((cents || 0) / 100)
const labels = { pending_staff_review: 'Awaiting Staff Review', pending_client_approval: 'Awaiting Client Approval',
  approved: 'Approved', declined: 'Declined', performed: 'Performed',
  staff_rejected: 'Rejected', cancelled: 'Cancelled' }
const workStatusStyles = {
  pending_staff_review: { color: 'var(--amber-ink)', background: 'var(--amber-soft)' },
  pending_client_approval: { color: 'var(--blue-ink)', background: 'var(--blue-soft)' },
  approved: { color: 'var(--green-ink)', background: 'var(--green-soft)' },
  performed: { color: 'var(--green-ink)', background: 'var(--green-soft)' },
  declined: { color: 'var(--muted)', background: 'var(--surface-soft)' },
  staff_rejected: { color: 'var(--red-ink)', background: 'var(--accent-soft)' },
  cancelled: { color: 'var(--muted)', background: 'var(--surface-soft)' },
}
const emptyItem = () => ({ kind: 'part', name: '', serviceId: '', description: '', quantity: '1' })

export default function AdditionalWorkPanel({ bookingId, jobId, bookingStatus, role, mechanicName, onUnresolvedChange }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const mutation = useRef(false)
  const [creating, setCreating] = useState(false)
  const [reviewing, setReviewing] = useState(null)
  const [confirming, setConfirming] = useState(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [lines, setLines] = useState([emptyItem()])
  const [evidence, setEvidence] = useState(null)
  const [preview, setPreview] = useState('')
  const [services, setServices] = useState([])
  const [quote, setQuote] = useState([])
  const endpoint = role === 'mechanic' ? `/job-orders/${jobId}/additional-work` : `/bookings/${bookingId}/additional-work`
  const refresh = useCallback(async () => {
    if (!bookingId || (role === 'mechanic' && !jobId)) return
    try {
      const { data } = await api.get(endpoint)
      setItems(data.items || []); onUnresolvedChange?.(blocksFinalInspection(data.items || []))
      setError('')
    } catch { setError('Additional work could not be loaded.') }
    finally { setLoading(false) }
  }, [bookingId, jobId, endpoint, role, onUnresolvedChange])
  useEffect(() => {
    const initial = setTimeout(refresh, 0)
    const timer = setInterval(refresh, 10000)
    return () => { clearTimeout(initial); clearInterval(timer) }
  }, [refresh])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  const canCreate = canRequestAdditionalWork(role, bookingStatus, jobId)
  function changeLine(index, patch) { setLines(current => current.map((line, at) => at === index ? { ...line, ...patch } : line)) }
  async function openCreate() {
    setCreating(true); setError('')
    try { setServices((await api.get('/services')).data.items || []) } catch { setServices([]) }
  }
  function closeCreate() { setCreating(false); setEvidence(null); setPreview('') }
  async function submit() {
    if (mutation.current) return
    const validationError = proposalFormError({ title, description, lines, services })
    if (validationError) { setError(validationError); return }
    mutation.current = true
    setBusy(true); setError('')
    try {
      const form = new FormData()
      form.append('issueTitle', title.trim()); form.append('issueDescription', description.trim())
      form.append('items', JSON.stringify(lines.map(line => line.kind === 'service'
        ? { kind: 'service', serviceId: line.serviceId, description: line.description, quantity: line.quantity }
        : { kind: 'part', name: line.name, description: line.description, quantity: line.quantity })))
      if (evidence) form.append('evidence', evidence)
      await api.post(`/job-orders/${jobId}/additional-work`, form)
      closeCreate(); setTitle(''); setDescription(''); setLines([emptyItem()]); await refresh()
    } catch (requestError) { setError(requestError.response?.data?.message || 'Additional work request could not be submitted.') }
    finally { mutation.current = false; setBusy(false) }
  }
  function openReview(item) {
    setReviewing(item)
    setQuote(item.originalProposalItems.map(line => ({ name: line.name, description: line.description || '',
      quantity: String(line.quantity), unitPrice: line.unitPriceCents == null ? '' : (line.unitPriceCents / 100).toFixed(2) })))
  }
  async function act(item, action, body = {}) {
    if (mutation.current) return
    mutation.current = true
    setBusy(true); setError('')
    try {
      await api.post(`/additional-work/${item._id}/${action}`, body)
      setConfirming(null); setReviewing(null); await refresh()
    } catch (requestError) { setError(requestError.response?.data?.message || 'Additional work could not be updated.') }
    finally { mutation.current = false; setBusy(false) }
  }
  const approvalTotal = confirming?.item.quoteTotalCents || 0
  return <DetailSection title="Additional Work" section="additional-work">
    {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
    {loading ? <Typography sx={{ fontSize: 13 }}>Loading additional work…</Typography>
      : items.length === 0 ? <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>No additional work requested.</Typography> : null}
    <Stack spacing={1.25} sx={{ mt: items.length ? .5 : 1 }}>
      {items.map(item => <Box key={item._id} sx={{ p: 1.5, border: '1px solid var(--line)', borderRadius: 2, bgcolor: 'var(--surface)' }}>
        {role === 'client' && item.status === 'pending_client_approval'
          && <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'primary.main', mb: .5 }}>Additional Work Approval Required</Typography>}
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }}
          justifyContent="space-between" gap={1.5} sx={{ minWidth: 0 }}>
          <Typography sx={{ minWidth: 0, flex: '1 1 auto', fontSize: 14, fontWeight: 700, overflowWrap: 'anywhere' }}>{item.issueTitle}</Typography>
          <Chip label={labels[item.status] || 'Status unavailable'} size="small"
            sx={{ flexShrink: 0, maxWidth: '100%', fontSize: 11, fontWeight: 700,
              color: workStatusStyles[item.status]?.color || 'var(--muted)',
              bgcolor: workStatusStyles[item.status]?.background || 'var(--surface-soft)' }} />
        </Stack>
        <Typography sx={{ mt: .5, fontSize: 12, color: 'text.secondary', whiteSpace: 'pre-wrap' }}>{item.issueDescription}</Typography>
        {['staff', 'admin'].includes(role) && <Typography sx={{ fontSize: 12 }}>Assigned Mechanic: {mechanicName || 'Mechanic record unavailable'}</Typography>}
        {item.evidenceImage?.secureUrl && <Button size="small" component="a" href={item.evidenceImage.secureUrl} target="_blank" rel="noopener noreferrer">View Evidence Photo</Button>}
        {['staff', 'admin'].includes(role) && <Box sx={{ mt: 1 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700 }}>Mechanic Request</Typography>
          {item.originalProposalItems?.map((line, index) => <Typography key={`${item._id}:original:${index}`} sx={{ fontSize: 12 }}>
            {line.kind === 'part' ? 'Part' : 'Service'} · {line.name} · Qty: {line.quantity}
            {line.description ? ` · ${line.description}` : ''}
            {Number.isSafeInteger(line.lineTotalCents) ? ` · Historical proposal: ${pesos(line.lineTotalCents)}` : ''}
          </Typography>)}
        </Box>}
        {item.quotedItems?.length > 0 && <Box sx={{ mt: 1 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700 }}>Customer Quote</Typography>
          {item.quotedItems.map((line, index) => <Typography key={`${item._id}:${index}`} sx={{ fontSize: 12 }}>
            {line.name} · {line.quantity} × {pesos(line.unitPriceCents)} = {pesos(line.lineTotalCents)}
          </Typography>)}
          <Typography sx={{ fontSize: 12, fontWeight: 700 }}>Additional Quote: {pesos(item.quoteTotalCents)}</Typography>
        </Box>}
        {canDecideAdditionalWork(role, item) && <>
          <Alert severity="info" sx={{ mt: 1 }}>Approved additional work will be included in your final service total.</Alert>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button size="small" color="inherit" disabled={busy} onClick={() => setConfirming({ item, action: 'decline' })}>Decline</Button>
            <Button size="small" variant="contained" disabled={busy} onClick={() => setConfirming({ item, action: 'approve' })}>Approve {pesos(item.quoteTotalCents)}</Button>
          </Stack>
        </>}
        {role === 'client' && item.status === 'approved' && <Typography sx={{ fontSize: 12, mt: .5 }}>Approved Total: {pesos(item.approvedTotalCents)}. Waiting for the service team to complete this work.</Typography>}
        {role === 'client' && item.status === 'declined' && <Typography sx={{ fontSize: 12, mt: .5 }}>This additional work will not be included in your bill.</Typography>}
        {role === 'client' && item.status === 'performed' && <Typography sx={{ fontSize: 12, mt: .5 }}>Approved Amount: {pesos(item.approvedTotalCents)}. Will be included in the final service total.</Typography>}
        {canReviewAdditionalWork(role, item) && <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <Button size="small" disabled={busy} onClick={() => openReview(item)}>Review Quote</Button>
          <Button size="small" color="error" disabled={busy} onClick={() => setConfirming({ item, action: 'reject' })}>Reject Request</Button>
        </Stack>}
        {canPerformAdditionalWork(role, item) && <Button size="small" disabled={busy} sx={{ mt: 1 }}
          onClick={() => setConfirming({ item, action: 'perform' })}>Mark as Performed</Button>}
        {['staff', 'admin'].includes(role) && ['pending_staff_review', 'pending_client_approval'].includes(item.status)
          && <Button size="small" color="inherit" disabled={busy} sx={{ mt: 1 }} onClick={() => setConfirming({ item, action: 'cancel' })}>Cancel Request</Button>}
      </Box>)}
      {canCreate && <Button size="small" variant="outlined" disabled={busy} onClick={openCreate} sx={{ alignSelf: 'flex-start' }}>Request Additional Work</Button>}
    </Stack>
    <Dialog open={creating} onClose={busy ? undefined : closeCreate} maxWidth="sm" fullWidth aria-label="Request additional work">
      <DialogTitle>Request Additional Work</DialogTitle>
      <DialogContent><Stack spacing={1.25} sx={{ pt: .5 }}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField size="small" label="Issue Title" value={title} onChange={event => setTitle(event.target.value)} slotProps={{ htmlInput: { maxLength: 120 } }} />
        <TextField size="small" label="Issue Description" value={description} multiline minRows={2} onChange={event => setDescription(event.target.value)} slotProps={{ htmlInput: { maxLength: 2000 } }} />
        <Button size="small" component="label" variant="outlined" sx={{ alignSelf: 'flex-start' }}>Choose Evidence Photo
          <input type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={event => {
            const file = event.target.files?.[0]
            if (file && !evidenceError(file)) {
              setEvidence(file); setPreview(URL.createObjectURL(file)); setError('')
            } else if (file) setError(evidenceError(file))
          }} />
        </Button>
        {preview && <Box component="img" src={preview} alt="Evidence preview" sx={{ width: 96, height: 72, objectFit: 'cover', borderRadius: 1 }} />}
        {lines.map((line, index) => <Box key={index} sx={{ p: 1.25, border: '1px solid var(--line)', borderRadius: 2, display: 'grid', gap: 1, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <TextField select size="small" label="Type" value={line.kind} onChange={event => changeLine(index, { ...emptyItem(), kind: event.target.value })}>
            <MenuItem value="part">Part</MenuItem><MenuItem value="service">Service</MenuItem>
          </TextField>
          {line.kind === 'service' ? <TextField select size="small" label="Service" value={line.serviceId} onChange={event => changeLine(index, { serviceId: event.target.value })}>
            {services.map(service => <MenuItem key={service._id} value={service._id}>{service.name}</MenuItem>)}
          </TextField> : <TextField size="small" label="Part Name" value={line.name} onChange={event => changeLine(index, { name: event.target.value })} />}
          <TextField size="small" label="Quantity" type="number" value={line.quantity} onChange={event => changeLine(index, { quantity: event.target.value })} slotProps={{ htmlInput: { min: 1, max: 1000, step: 1 } }} />
          <TextField size="small" label="Description (optional)" value={line.description} onChange={event => changeLine(index, { description: event.target.value })} sx={{ gridColumn: '1 / -1' }} />
          {lines.length > 1 && <Button size="small" color="inherit" onClick={() => setLines(current => current.filter((_, at) => at !== index))}>Remove Item</Button>}
        </Box>)}
        <Button size="small" onClick={() => setLines(current => [...current, emptyItem()])} disabled={lines.length >= 20} sx={{ alignSelf: 'flex-start' }}>+ Add Item</Button>
      </Stack></DialogContent>
      <DialogActions><Button disabled={busy} onClick={closeCreate}>Cancel</Button><Button disabled={busy} onClick={submit} variant="contained">Submit Request</Button></DialogActions>
    </Dialog>
    <Dialog open={Boolean(reviewing)} onClose={busy ? undefined : () => setReviewing(null)} maxWidth="sm" fullWidth aria-label="Review additional work quote">
      <DialogTitle>Review Customer Quote</DialogTitle>
      <DialogContent><Stack spacing={1.25} sx={{ pt: .5 }}>
        {error && <Alert severity="error">{error}</Alert>}
        <Typography sx={{ fontSize: 13, fontWeight: 700 }}>Mechanic Request: {reviewing?.issueTitle}</Typography>
        <Typography sx={{ fontSize: 12 }}>{reviewing?.issueDescription}</Typography>
        {reviewing?.evidenceImage?.secureUrl && <Button size="small" component="a" href={reviewing.evidenceImage.secureUrl} target="_blank" rel="noopener noreferrer">View Evidence Photo</Button>}
        {quote.map((line, index) => <Box key={index} sx={{ p: 1, border: '1px solid var(--line)', borderRadius: 2, display: 'grid', gap: 1, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <Typography sx={{ gridColumn: '1 / -1', fontSize: 12 }}>{reviewing?.originalProposalItems[index]?.kind === 'part' ? 'Part' : 'Service'} · {reviewing?.originalProposalItems[index]?.name} · Requested Qty: {reviewing?.originalProposalItems[index]?.quantity}</Typography>
          <TextField size="small" label="Customer-facing Name" value={line.name} onChange={event => setQuote(current => current.map((value, at) => at === index ? { ...value, name: event.target.value } : value))} />
          <TextField size="small" label="Description" value={line.description} onChange={event => setQuote(current => current.map((value, at) => at === index ? { ...value, description: event.target.value } : value))} />
          <TextField size="small" label="Quantity" type="number" value={line.quantity} onChange={event => setQuote(current => current.map((value, at) => at === index ? { ...value, quantity: event.target.value } : value))} />
          <TextField size="small" label="Unit Price (PHP)" type="number" value={line.unitPrice} onChange={event => setQuote(current => current.map((value, at) => at === index ? { ...value, unitPrice: event.target.value } : value))} />
        </Box>)}
        <Typography sx={{ fontSize: 13, fontWeight: 700 }}>Quote Total: {money(quote.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0))}</Typography>
      </Stack></DialogContent>
      <DialogActions><Button disabled={busy} onClick={() => setReviewing(null)}>Cancel</Button><Button disabled={busy} variant="contained" onClick={() => act(reviewing, 'send', { items: quote })}>Send Quote to Client</Button></DialogActions>
    </Dialog>
    <Dialog open={Boolean(confirming)} onClose={busy ? undefined : () => setConfirming(null)} maxWidth="xs" fullWidth aria-label="Confirm additional work action">
      <DialogTitle>{confirming?.action === 'approve' ? 'Approve Additional Work?' : confirming?.action === 'decline' ? 'Decline this additional work request?' : 'Confirm additional work action'}</DialogTitle>
      <DialogContent>{error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}{confirming?.action === 'approve' ? <Stack spacing={.5}>
        {confirming.item.quotedItems?.map((line, index) => <Typography key={index} sx={{ fontSize: 13 }}>{line.name} — {pesos(line.lineTotalCents)}</Typography>)}
        <Typography sx={{ fontWeight: 700 }}>Total: {pesos(approvalTotal)}</Typography>
        <Typography sx={{ fontSize: 12 }}>This approved amount may be included in your final service total after the work is completed.</Typography>
      </Stack> : <Typography sx={{ fontSize: 13 }}>This action will be recorded in the request history.</Typography>}</DialogContent>
      <DialogActions><Button disabled={busy} onClick={() => setConfirming(null)}>Cancel</Button>
        <Button disabled={busy} color={confirming?.action === 'decline' || confirming?.action === 'reject' ? 'error' : 'primary'}
          onClick={() => act(confirming.item, confirming.action)}>{confirming?.action === 'perform' ? 'Mark as Performed' : confirming?.action === 'approve' ? 'Approve' : confirming?.action === 'decline' ? 'Decline' : 'Confirm'}</Button>
      </DialogActions>
    </Dialog>
  </DetailSection>
}
