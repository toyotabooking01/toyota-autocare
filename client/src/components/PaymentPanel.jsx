import { useCallback, useEffect, useState } from 'react'
import { Alert, Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { DetailInfo, DetailSection } from './RecordDetails'
import { money } from '../pages/bookingDisplay'
import api from '../services/api'
import { releaseBlockReason } from '../utils/paymentRelease'

const pesos = cents => money((cents || 0) / 100)
export default function PaymentPanel({ bookingId, bookingStatus, role, onSummary }) {
  const active = role !== 'client' || ['ready_for_release', 'completed'].includes(bookingStatus)
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('gcash')
  const [reference, setReference] = useState('')
  const [proof, setProof] = useState('')
  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get(`/bookings/${bookingId}/payment`)
      setSummary(data.item); onSummary?.(data.item); setError('')
    } catch { setError('Payment summary could not be loaded.'); onSummary?.(null) }
  }, [bookingId, onSummary])
  useEffect(() => {
    if (!active) return undefined
    const initial = setTimeout(refresh, 0)
    const timer = setInterval(refresh, 10000)
    return () => { clearTimeout(initial); clearInterval(timer) }
  }, [active, refresh])
  async function submit() {
    const stage = bookingStatus === 'ready_for_release' ? 'final' : 'downpayment'
    const value = Number(amount)
    if (amount === '' || !Number.isFinite(value) || value < 0) { setError('Enter a valid payment amount.'); return }
    setBusy(true); setError('')
    try {
      const { data } = await api.post(`/bookings/${bookingId}/payments`, { stage, amount: value, method, reference, proof })
      setSummary(data.item); onSummary?.(data.item); setAmount(''); setReference(''); setProof('')
    } catch (requestError) { setError(requestError.response?.data?.message || 'Payment could not be submitted.') }
    finally { setBusy(false) }
  }
  async function decide(payment, action) {
    setBusy(true); setError('')
    try {
      const { data } = await api.post(`/bookings/${bookingId}/payments/${payment.id}/${action}`)
      setSummary(data.item); onSummary?.(data.item)
    } catch (requestError) { setError(requestError.response?.data?.message || 'Payment could not be processed.') }
    finally { setBusy(false) }
  }
  if (!active) return null
  const releaseStage = ['ready_for_release', 'completed'].includes(bookingStatus)
  const final = summary?.payments?.filter(payment => payment.stage === 'final').at(-1)
  const pendingDownpayment = summary?.payments?.find(payment => payment.stage === 'downpayment' && payment.status === 'submitted')
  const paymentStatus = summary?.paymentStatus
  const label = paymentStatus === 'paid' ? 'Fully Paid' : paymentStatus === 'pending_verification' ? 'Pending Verification'
    : paymentStatus === 'rejected' ? 'Final Payment Rejected' : 'Final Payment Due'
  const due = summary ? Math.max(0, summary.finalTotalCents - summary.downpaymentPaidCents) : 0
  const canPay = ['client', 'staff', 'admin'].includes(role)
  const canSubmitFinal = canPay && bookingStatus === 'ready_for_release' && summary && !['paid', 'pending_verification'].includes(paymentStatus)
  const canSubmitDown = canPay && ['pending', 'confirmed', 'checked_in', 'mechanic_assigned', 'in_service', 'final_inspection'].includes(bookingStatus)
  return <DetailSection title="Payment and release">
    {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
    {!summary ? <Typography sx={{ fontSize: 13 }}>Loading payment summary…</Typography> : <Stack spacing={1.5}>
      <DetailInfo items={[
        [releaseStage ? 'Final Service Total' : 'Service Estimate', pesos(summary.finalTotalCents)],
        ['Downpayment Paid', pesos(summary.downpaymentPaidCents)],
        ...(releaseStage ? paymentStatus === 'paid' ? [['Total Paid', pesos(summary.totalPaidCents)], ['Remaining Balance', pesos(summary.remainingBalanceCents)]]
          : [['Final Payment Due', pesos(due)]] : []),
        ...(final ? [['Final Payment', pesos(final.amountCents)], ['Payment Method', final.method.replaceAll('_', ' ')],
          ...(final.reference ? [['Reference', final.reference]] : []), ...(final.proof ? [['Proof', final.proof]] : [])] : []),
        ['Payment Status', releaseStage ? label : pendingDownpayment ? 'Downpayment Pending Verification' : 'Downpayment Stage'],
        ...(final?.verifiedAt && role !== 'client' ? [['Verified by', `${final.verifiedByRole || 'Staff'} · ${new Date(final.verifiedAt).toLocaleString()}`]] : []),
        ...(summary.release && role !== 'client' ? [['Released by', `${summary.release.byRole} · ${new Date(summary.release.at).toLocaleString()}`]] : []),
      ]} />
      {releaseStage && paymentStatus === 'pending_verification' && <Alert severity="info">{role === 'client'
        ? 'Your final payment is awaiting verification before vehicle release.' : 'Final payment is awaiting verification before vehicle release.'}</Alert>}
      {releaseStage && paymentStatus === 'paid' && <Alert severity="success">{role === 'client'
        ? 'Payment complete. Your vehicle is eligible for release.' : 'Payment complete. Vehicle is eligible for release.'}</Alert>}
      {bookingStatus === 'ready_for_release' && paymentStatus !== 'paid' && paymentStatus !== 'pending_verification'
        && <Alert severity="warning">{releaseBlockReason(summary)}</Alert>}
      {(canSubmitFinal || canSubmitDown) && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>
        <TextField size="small" type="number" label={canSubmitFinal ? 'Final payment amount (PHP)' : 'Downpayment amount (PHP)'} value={amount}
          onChange={event => setAmount(event.target.value)} slotProps={{ htmlInput: { min: 0, step: '0.01' } }} />
        <TextField select size="small" label="Payment method" value={method} onChange={event => setMethod(event.target.value)}>
          {['gcash', 'maya', 'bank_transfer', 'cash', 'no_charge'].map(value => <MenuItem key={value} value={value}>{value.replaceAll('_', ' ')}</MenuItem>)}
        </TextField>
        <TextField size="small" label="Reference (if applicable)" value={reference} onChange={event => setReference(event.target.value)} />
        <TextField size="small" label="Proof reference (if applicable)" value={proof} onChange={event => setProof(event.target.value)} />
        <Button variant="outlined" disabled={busy} onClick={submit}>Submit {canSubmitFinal ? 'Final Payment' : 'Downpayment'}</Button>
      </Box>}
      {['staff', 'admin'].includes(role) && summary.payments.filter(payment => payment.status === 'submitted').map(payment => <Stack key={payment.id}
        direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
        <Typography sx={{ fontSize: 13 }}>{payment.stage === 'final' ? 'Final payment' : 'Downpayment'} {pesos(payment.amountCents)} awaits verification.</Typography>
        <Button disabled={busy} onClick={() => decide(payment, 'verify')}>Verify</Button>
        <Button disabled={busy} color="error" onClick={() => decide(payment, 'reject')}>Reject</Button>
      </Stack>)}
    </Stack>}
  </DetailSection>
}
