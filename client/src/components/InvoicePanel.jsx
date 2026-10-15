import { useState } from 'react'
import { Alert, Button, Stack, Typography } from '@mui/material'
import { DetailInfo, DetailSection } from './RecordDetails'
import { money } from '../pages/bookingDisplay'
import api from '../services/api'
import { openFinancialPdf } from '../utils/openFinancialPdf'

const pesos = cents => money((cents || 0) / 100)
const canRetryEmail = invoice => invoice.document?.status === 'generated'
  && (invoice.emailDelivery?.status === 'failed' || (invoice.emailDelivery?.status === 'sending'
    && invoice.emailDelivery.lastAttemptAt
    && Date.now() - new Date(invoice.emailDelivery.lastAttemptAt).getTime() > 10 * 60 * 1000))
export default function InvoicePanel({ invoice, role, onRefresh }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!invoice) return null
  const financial = invoice.financialSnapshot
  const status = invoice.document?.status
  const canRetry = ['staff', 'admin'].includes(role)
  const email = invoice.emailDelivery
  async function retry(action) {
    setBusy(true); setError('')
    try { await api.post(`/invoices/${invoice.id}/retry-${action}`); await onRefresh() }
    catch (requestError) { setError(requestError.response?.data?.message || 'Invoice processing could not be retried.') }
    finally { setBusy(false) }
  }
  return <DetailSection title="Final Service Invoice" section="billing">
    {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
    <DetailInfo items={[
      ['Invoice', invoice.invoiceNumber],
      ['Original Services', pesos(financial.originalServicesTotalCents)],
      ['Additional Approved Work', pesos(financial.additionalWorkTotalCents)],
      ['Final Service Total', pesos(financial.finalServiceTotalCents)],
      ['Verified Payments at Issuance', pesos(financial.verifiedDownpaymentCents + financial.otherVerifiedPaymentsCents)],
      ['Amount Due at Issuance', pesos(financial.amountDueCents)],
    ]} />
    <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 1 }}>
      <Button size="small" disabled={busy} onClick={() => openFinancialPdf({ kind: 'invoice', id: invoice.id,
        expectedType: 'final_service', onError: setError })}>View Invoice</Button>
      {canRetry && ['pending', 'processing', 'failed'].includes(status)
        && <Button size="small" disabled={busy} onClick={() => retry('document')}>Retry PDF</Button>}
      {canRetry && canRetryEmail(invoice) && <Button size="small" disabled={busy} onClick={() => retry('email')}>Retry Email</Button>}
    </Stack>
    {['pending', 'processing'].includes(status) && <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Document is being prepared.</Typography>}
    {status === 'failed' && <Alert severity="warning" sx={{ mt: 1 }}>Invoice PDF is temporarily unavailable.</Alert>}
    {email?.status === 'failed' && <Alert severity="warning" sx={{ mt: 1 }}>Invoice email could not be delivered.</Alert>}
  </DetailSection>
}
