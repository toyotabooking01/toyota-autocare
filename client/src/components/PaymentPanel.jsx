import { useCallback, useEffect, useState } from 'react'
import { useRef } from 'react'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { DetailInfo, DetailSection } from './RecordDetails'
import { money } from '../pages/bookingDisplay'
import api from '../services/api'
import { releaseBlockReason } from '../utils/paymentRelease'
import { needsPaymentProof, paymentForm, proofError } from '../utils/paymentProof'
import { Link } from 'react-router-dom'
import { downpaymentState } from '../utils/downpaymentState'
import { canReviewPayment } from '../utils/bookingActions'
import { receiptForPayment } from '../utils/receiptVisibility'
import InvoicePanel from './InvoicePanel'
import { statusStyles } from '../app/statuses'
import { openFinancialPdf } from '../utils/openFinancialPdf'
import { formatPaymentMethod } from '../utils/paymentMethod'

const pesos = cents => money((cents || 0) / 100)
const canRetryEmail = receipt => receipt?.document?.status === 'generated'
  && !(receipt.type === 'final_payment' && receipt.settlementSnapshot?.remainingBalanceCents === 0)
  && (receipt.emailDelivery?.status === 'failed' || (receipt.emailDelivery?.status === 'sending'
    && receipt.emailDelivery.lastAttemptAt
    && Date.now() - new Date(receipt.emailDelivery.lastAttemptAt).getTime() > 10 * 60 * 1000))
export default function PaymentPanel({ bookingId, bookingStatus, role, onSummary, onPaymentSubmitted, onHoldExpired, onDecision }) {
  const active = ['awaiting_downpayment', 'pending', 'confirmed', 'checked_in', 'mechanic_assigned', 'in_service', 'final_inspection',
    'ready_for_release', 'completed', 'cancelled', 'rejected', 'no_show'].includes(bookingStatus)
  const [summary, setSummary] = useState(null)
  const [receipts, setReceipts] = useState([])
  const [invoices, setInvoices] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('gcash')
  const [reference, setReference] = useState('')
  const [proof, setProof] = useState(null)
  const [proofMessage, setProofMessage] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [viewingProof, setViewingProof] = useState(null)
  const [now, setNow] = useState(0)
  const proofInput = useRef(null)
  const mutation = useRef(false)
  const previewUrlRef = useRef('')
  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current) }, [])
  useEffect(() => {
    if (bookingStatus !== 'awaiting_downpayment') return undefined
    const initial = setTimeout(() => setNow(Date.now()), 0)
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => { clearTimeout(initial); clearInterval(timer) }
  }, [bookingStatus])
  function clearProof() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = ''
    setPreviewUrl('')
    setProof(null)
  }
  function selectProof(file) {
    const message = proofError(file)
    setProofMessage(message)
    if (message) return
    clearProof()
    const url = URL.createObjectURL(file)
    previewUrlRef.current = url
    setPreviewUrl(url)
    setProof(file)
  }
  const refresh = useCallback(async () => {
    try {
      const [{ data }, receiptResponse, invoiceResponse] = await Promise.all([
        api.get(`/bookings/${bookingId}/payment`), api.get(`/bookings/${bookingId}/receipts`).catch(() => null),
        api.get(`/bookings/${bookingId}/invoices`).catch(() => null),
      ])
      setSummary(data.item); setReceipts(receiptResponse?.data.items || []);
      setInvoices(invoiceResponse?.data.items || []); onSummary?.(data.item); setError('')
    } catch { setError('Payment summary could not be loaded.'); onSummary?.(null) }
  }, [bookingId, onSummary])
  useEffect(() => {
    if (!active) return undefined
    const initial = setTimeout(refresh, 0)
    const timer = setInterval(refresh, 10000)
    return () => { clearTimeout(initial); clearInterval(timer) }
  }, [active, refresh])
  async function submit() {
    if (mutation.current) return
    const stage = bookingStatus === 'ready_for_release' ? 'final' : 'downpayment'
    const provisional = bookingStatus === 'awaiting_downpayment'
    const clientFinal = stage === 'final' && role === 'client'
    const value = provisional ? summary?.downpaymentRequiredCents / 100
      : clientFinal ? summary?.remainingBalanceCents / 100 : Number(amount)
    if ((!provisional && !clientFinal && amount === '') || !Number.isFinite(value) || value < 0) { setError('Enter a valid payment amount.'); return }
    if (provisional && !reference.trim()) { setError('Payment reference is required.'); return }
    if (needsPaymentProof(method)) {
      const message = proofError(proof)
      if (message) { setProofMessage(message); return }
    }
    mutation.current = true; setBusy(true); setError('')
    try {
      const { data } = await api.post(`/bookings/${bookingId}/payments`, paymentForm({ stage, amount: value, method, reference, proof }))
      setSummary(data.item); onSummary?.(data.item); setAmount(''); setReference(''); clearProof(); setProofMessage('')
      onPaymentSubmitted?.(data.item)
    } catch (requestError) { setError(requestError.response?.data?.message || 'Payment could not be submitted.') }
    finally { mutation.current = false; setBusy(false) }
  }
  async function decide(payment, action) {
    if (mutation.current) return
    mutation.current = true; setBusy(true); setError('')
    try {
      const { data } = await api.post(`/bookings/${bookingId}/payments/${payment.id}/${action}`)
      setSummary(data.item); onSummary?.(data.item)
      onDecision?.(data.item)
      await refresh()
    } catch (requestError) { setError(requestError.response?.data?.message || 'Payment could not be processed.') }
    finally { mutation.current = false; setBusy(false) }
  }
  async function retryReceipt(receiptId, action) {
    if (!receiptId || mutation.current) return
    mutation.current = true; setBusy(true); setError('')
    try {
      await api.post(`/receipts/${receiptId}/retry-${action}`)
      await refresh()
    } catch (requestError) { setError(requestError.response?.data?.message || 'Receipt processing could not be retried.') }
    finally { mutation.current = false; setBusy(false) }
  }
  if (!active) return null
  const downpayment = downpaymentState(summary, bookingStatus, now)
  const effectiveStatus = downpayment.status
  const releaseStage = ['ready_for_release', 'completed'].includes(effectiveStatus)
  const final = summary?.payments?.filter(payment => payment.stage === 'final').at(-1)
  const fullReceipt = receipts.find(receipt => receipt.type === 'full_payment')
  const latestDownpayment = downpayment.latest
  const pendingDownpayment = summary?.payments?.find(payment => payment.stage === 'downpayment' && payment.status === 'submitted')
  const paymentStatus = summary?.paymentStatus
  const label = paymentStatus === 'paid' ? 'Fully Paid' : paymentStatus === 'pending_verification' ? 'Pending Verification'
    : paymentStatus === 'rejected' ? 'Final Payment Rejected' : 'Final Payment Due'
  const due = summary?.remainingBalanceCents || 0
  const consolidatedFinalPayment = paymentStatus === 'paid' && due === 0 && Boolean(fullReceipt)
  const canPay = ['client', 'staff', 'admin'].includes(role)
  const provisional = downpayment.provisional
  const secondsRemaining = downpayment.secondsRemaining
  const holdActive = downpayment.holdActive
  const canSubmitFinal = canPay && effectiveStatus === 'ready_for_release' && summary && !['paid', 'pending_verification'].includes(paymentStatus)
  const canSubmitDown = canPay && !pendingDownpayment && summary?.holdStatus !== 'converted' && ((role === 'client' && holdActive)
    || ['pending', 'confirmed', 'checked_in', 'mechanic_assigned', 'in_service', 'final_inspection'].includes(effectiveStatus))
  return <DetailSection title={provisional ? 'Booking Summary' : releaseStage ? 'Billing and Payment' : 'Payment'} section="payment">
    {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
    {!summary ? <Typography sx={{ fontSize: 13 }}>Loading payment summary…</Typography> : <Stack spacing={1.5}>
      <DetailInfo items={[
        [releaseStage ? 'Final Service Total' : 'Estimated Service Total', pesos(releaseStage ? summary.finalTotalCents : summary.estimatedTotalCents ?? summary.finalTotalCents)],
        ...(provisional ? [['Required Downpayment — 50%', pesos(summary.downpaymentRequiredCents)]] : []),
        ['Downpayment Paid', pesos(summary.downpaymentPaidCents)],
        ...(releaseStage ? [['Total Verified Paid', pesos(summary.totalPaidCents)], ['Remaining Balance', pesos(due)]] : []),
        ...(releaseStage && ['staff', 'admin'].includes(role) ? [['Release Eligibility', effectiveStatus === 'completed' ? 'Released'
          : paymentStatus === 'paid' && due === 0 ? 'Eligible'
            : paymentStatus === 'pending_verification' ? 'Blocked — Pending Verification' : 'Blocked — Outstanding Balance']] : []),
        ...(final && !consolidatedFinalPayment ? [['Final Payment', pesos(final.amountCents)], ['Payment Method', formatPaymentMethod(final.method)],
          ...(final.reference ? [['Reference', final.reference]] : [])] : []),
        ['Payment Status', releaseStage ? label : downpayment.paymentLabel || (pendingDownpayment ? 'Pending Verification' : 'Downpayment Due')],
        ...(downpayment.reservationLabel ? [['Schedule', downpayment.reservationLabel]] : []),
        ...(summary.holdStatus === 'converted' ? [['Booking Status', statusStyles[effectiveStatus]?.label || 'Current']] : []),
        ...(final?.verifiedAt && role !== 'client' ? [['Verified by', `${final.verifiedByRole || 'Staff'} · ${new Date(final.verifiedAt).toLocaleString()}`]] : []),
        ...(summary.release && role !== 'client' ? [['Released by', `${summary.release.byRole} · ${new Date(summary.release.at).toLocaleString()}`]] : []),
      ]} />
      {provisional && summary.holdStatus === 'active' && <Typography sx={{ fontSize: 13 }}>Temporary Slot Hold: {secondsRemaining > 0
        ? `${String(Math.floor(secondsRemaining / 60)).padStart(2, '0')}:${String(secondsRemaining % 60).padStart(2, '0')} remaining`
        : 'Your temporary slot hold expired.'}</Typography>}
      {provisional && ((summary.holdStatus === 'active' && secondsRemaining === 0) || summary.holdReleaseReason === 'expired') && (onHoldExpired
        ? <Button variant="outlined" onClick={onHoldExpired}>Select another schedule</Button>
        : <Button variant="outlined" component={Link} to="/client/book-service">Select another schedule</Button>)}
      {provisional && summary.holdStatus === 'payment_submitted' && <Alert severity="info">Payment Pending Verification. The selected schedule is being held while your payment is reviewed.</Alert>}
      {downpayment.canRetry
        && <Alert severity="warning">Downpayment Rejected. Please submit a new payment proof within the remaining hold time.</Alert>}
      {summary.holdStatus === 'converted' && effectiveStatus === 'pending'
        && <Alert severity="success">Your schedule is reserved. Your booking is awaiting confirmation.</Alert>}
      {provisional && summary.holdReleaseReason === 'expired' && <Alert severity="warning">Downpayment window expired. Select another schedule to book again.</Alert>}
      {summary.payments.filter(payment => payment.proofImage?.secureUrl).map(payment => <Box key={payment.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.25, border: '1px solid var(--line)', borderRadius: 2, maxWidth: 380 }}>
        <Box component="img" src={payment.proofImage.secureUrl} alt="Payment proof thumbnail" sx={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 1 }} />
        <Box sx={{ minWidth: 0, flex: 1 }}><Typography sx={{ fontSize: 12, fontWeight: 600 }}>Payment Proof</Typography><Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{payment.stage === 'final' ? 'Final payment' : 'Downpayment'} · {payment.status}</Typography></Box>
        <Button size="small" onClick={() => setViewingProof(payment.proofImage)}>View Proof</Button>
      </Box>)}
      {summary.payments.filter(payment => !(consolidatedFinalPayment && payment.stage === 'final')).map(payment => {
        const receipt = receiptForPayment(payment, receipts)
        return <Box key={`history:${payment.id}`} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: 12, color: payment.status === 'verified' ? 'success.main' : 'text.secondary' }}>
            {payment.stage === 'final' ? 'Final Payment' : 'Downpayment'} {pesos(payment.amountCents)} · {formatPaymentMethod(payment.method)} · {payment.status === 'submitted' ? 'Pending Verification' : payment.status === 'verified' ? 'Verified' : 'Rejected'}
          </Typography>
          {receipt ? <>
            <Button size="small" disabled={busy} onClick={() => openFinancialPdf({ kind: 'receipt', id: receipt.id,
              expectedType: payment.stage === 'final' ? 'final_payment' : 'downpayment', onError: setError })}>View Receipt</Button>
            {['pending', 'processing'].includes(receipt.document?.status) && <Typography sx={{ fontSize: 12 }}>Document is being prepared.</Typography>}
            {receipt.document?.status === 'failed' && <Typography sx={{ fontSize: 12, color: 'error.main' }}>Receipt PDF is temporarily unavailable.</Typography>}
            {['staff', 'admin'].includes(role) && ['pending', 'processing', 'failed'].includes(receipt.document?.status)
              && <Button size="small" disabled={busy} onClick={() => retryReceipt(receipt.id, 'document')}>Retry Receipt</Button>}
            {['staff', 'admin'].includes(role) && canRetryEmail(receipt)
              && <Button size="small" disabled={busy} onClick={() => retryReceipt(receipt.id, 'email')}>Retry Email</Button>}
          </>
            : payment.status === 'verified' ? <Typography sx={{ fontSize: 12 }}>Receipt is being prepared.</Typography> : null}
        </Box>
      })}
      {fullReceipt && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Button size="small" disabled={busy} onClick={() => openFinancialPdf({ kind: 'receipt', id: fullReceipt.id,
          expectedType: 'full_payment', onError: setError })}>View Full Payment Receipt</Button>
        {['pending', 'processing'].includes(fullReceipt.document?.status) && <Typography sx={{ fontSize: 12 }}>Document is being prepared.</Typography>}
        {fullReceipt.document?.status === 'failed' && <Typography sx={{ fontSize: 12, color: 'error.main' }}>Receipt PDF is temporarily unavailable.</Typography>}
        {['staff', 'admin'].includes(role) && ['pending', 'processing', 'failed'].includes(fullReceipt.document?.status)
          && <Button size="small" disabled={busy} onClick={() => retryReceipt(fullReceipt.id, 'document')}>Retry Receipt</Button>}
        {['staff', 'admin'].includes(role) && canRetryEmail(fullReceipt)
          && <Button size="small" disabled={busy} onClick={() => retryReceipt(fullReceipt.id, 'email')}>Retry Email</Button>}
      </Box>}
      {invoices[0] && <InvoicePanel invoice={invoices[0]} role={role} onRefresh={refresh} />}
      {releaseStage && paymentStatus === 'pending_verification' && <Alert severity="info">{role === 'client'
        ? 'Your final payment is awaiting verification before vehicle release.' : 'Final payment is awaiting verification before vehicle release.'}</Alert>}
      {releaseStage && paymentStatus === 'paid' && <Alert severity="success">{effectiveStatus === 'completed'
        ? 'Payment complete. Vehicle release is recorded.' : role === 'client'
          ? 'Payment complete. Your vehicle is eligible for release.' : 'Payment complete. Vehicle is eligible for release.'}</Alert>}
      {effectiveStatus === 'ready_for_release' && paymentStatus !== 'paid' && paymentStatus !== 'pending_verification'
        && <Alert severity="warning">{releaseBlockReason(summary)}</Alert>}
      {(canSubmitFinal || canSubmitDown) && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>
        {!provisional && <TextField size="small" type="number" label={canSubmitFinal ? 'Final payment amount (PHP)' : 'Downpayment amount (PHP)'}
          value={canSubmitFinal && role === 'client' ? (due / 100).toFixed(2) : amount}
          onChange={event => setAmount(event.target.value)} slotProps={{ htmlInput: { min: 0, step: '0.01', readOnly: canSubmitFinal && role === 'client' } }} />
        }
        <TextField select size="small" label="Payment method" value={method} onChange={event => { setMethod(event.target.value); setProofMessage(''); if (!needsPaymentProof(event.target.value)) clearProof() }}>
          {(provisional ? ['gcash', 'maya', 'bank_transfer'] : ['gcash', 'maya', 'bank_transfer', 'cash', 'no_charge']).map(value => <MenuItem key={value} value={value}>{formatPaymentMethod(value)}</MenuItem>)}
        </TextField>
        <TextField size="small" label={provisional ? 'Reference Number' : 'Reference (if applicable)'} required={provisional} value={reference} onChange={event => setReference(event.target.value)} />
        {needsPaymentProof(method) && <Box sx={{ gridColumn: '1 / -1', minWidth: 0 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600, mb: .75 }}>Payment Proof</Typography>
          <input ref={proofInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Payment proof image" hidden
            onChange={event => { if (event.target.files?.[0]) selectProof(event.target.files[0]); event.target.value = '' }} />
          {!proof ? <Button size="small" variant="outlined" disabled={busy} onClick={() => proofInput.current?.click()}>Choose Image</Button>
            : <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: 1, border: '1px solid var(--line)', borderRadius: 2, maxWidth: 420 }}>
              {previewUrl && <Box component="img" src={previewUrl} alt="Selected payment proof" sx={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 1 }} />}
              <Box sx={{ minWidth: 0, flex: 1 }}><Typography noWrap sx={{ fontSize: 12, fontWeight: 600 }}>{proof.name}</Typography>
                <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{proof.type === 'image/jpeg' ? 'JPG' : proof.type === 'image/png' ? 'PNG' : 'WebP'} · {(proof.size / 1024 / 1024).toFixed(1)} MB</Typography>
                <Button size="small" disabled={busy} onClick={() => proofInput.current?.click()}>Replace</Button>
                <Button size="small" disabled={busy} onClick={() => { clearProof(); setProofMessage('') }}>Remove</Button>
              </Box>
            </Box>}
          {proofMessage && <Typography role="alert" sx={{ mt: .5, fontSize: 12, color: 'error.main' }}>{proofMessage}</Typography>}
        </Box>}
        <Button variant="outlined" disabled={busy || (provisional && !holdActive)} onClick={submit}>{canSubmitFinal ? 'Submit Final Payment'
          : latestDownpayment?.status === 'rejected' && provisional ? 'Submit Downpayment Again' : 'Submit Downpayment'}</Button>
      </Box>}
      {summary.payments.filter(payment => canReviewPayment(payment, role)).map(payment => <Stack key={payment.id}
        direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
        <Typography sx={{ fontSize: 13 }}>{payment.stage === 'final' ? 'Final payment' : 'Downpayment'} {pesos(payment.amountCents)} awaits verification.</Typography>
        {payment.proofImage?.secureUrl && <Button disabled={busy} onClick={() => setViewingProof(payment.proofImage)}>View Proof</Button>}
        <Button disabled={busy} onClick={() => decide(payment, 'verify')}>Verify</Button>
        <Button disabled={busy} color="error" onClick={() => decide(payment, 'reject')}>Reject</Button>
      </Stack>)}
    </Stack>}
    <Dialog open={Boolean(viewingProof)} onClose={() => setViewingProof(null)} maxWidth="md" fullWidth aria-label="Payment proof viewer">
      <DialogContent sx={{ textAlign: 'center' }}>{viewingProof && <Box component="img" src={viewingProof.secureUrl} alt="Payment proof" sx={{ display: 'block', maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', mx: 'auto' }} />}</DialogContent>
      <DialogActions><Button onClick={() => setViewingProof(null)}>Close</Button></DialogActions>
    </Dialog>
  </DetailSection>
}
