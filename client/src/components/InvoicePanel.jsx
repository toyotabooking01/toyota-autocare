import { useState } from 'react'
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Stack, Typography } from '@mui/material'
import { NavArrowDown, NavArrowRight } from 'iconoir-react'
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
  return <Accordion className="invoice-disclosure" disableGutters elevation={0} sx={{ border: '1px solid var(--line)', borderRadius: '8px !important', '&::before': { display: 'none' }, bgcolor: 'transparent' }}>
    <AccordionSummary expandIcon={<NavArrowDown width={16} height={16} strokeWidth={1.7} />} sx={{ minHeight: 42, px: 1.25, '& .MuiAccordionSummary-content': { my: .75, alignItems: 'center' } }}>
      <Typography sx={{ minWidth: 0, flex: 1, fontSize: 12, fontWeight: 650 }}>Final Service Invoice</Typography>
      <Typography sx={{ mr: 1.5, fontSize: 11, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{invoice.invoiceNumber}</Typography>
    </AccordionSummary>
    <AccordionDetails sx={{ px: 1.5, pt: .25, pb: 1.5 }}>
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' }, columnGap: 2, rowGap: 1.25 }}>
        <InvoiceValue label="Invoice" value={invoice.invoiceNumber} />
        <InvoiceValue label="Original Services" value={pesos(financial.originalServicesTotalCents)} />
        <InvoiceValue label="Additional Approved Work" value={pesos(financial.additionalWorkTotalCents)} />
        <InvoiceValue label="Final Service Total" value={pesos(financial.finalServiceTotalCents)} />
        <InvoiceValue label="Verified Payments at Issuance" value={pesos(financial.verifiedDownpaymentCents + financial.otherVerifiedPaymentsCents)} />
        <InvoiceValue label="Amount Due at Issuance" value={pesos(financial.amountDueCents)} />
      </Box>
      <Stack direction="row" flexWrap="wrap" gap={.5} sx={{ mt: 1 }}>
        <Button size="small" disabled={busy} endIcon={<NavArrowRight width={14} height={14} />} onClick={() => openFinancialPdf({ kind: 'invoice', id: invoice.id,
          expectedType: 'final_service', onError: setError })}>View Invoice</Button>
        {canRetry && ['pending', 'processing', 'failed'].includes(status)
          && <Button size="small" disabled={busy} onClick={() => retry('document')}>Retry PDF</Button>}
        {canRetry && canRetryEmail(invoice) && <Button size="small" disabled={busy} onClick={() => retry('email')}>Retry email</Button>}
      </Stack>
      {['pending', 'processing'].includes(status) && <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Document is being prepared.</Typography>}
      {status === 'failed' && <Alert severity="warning" sx={{ mt: 1 }}>Invoice PDF is temporarily unavailable.</Alert>}
      {email?.status === 'failed' && <Alert severity="warning" sx={{ mt: 1 }}>Invoice email could not be delivered.</Alert>}
    </AccordionDetails>
  </Accordion>
}

function InvoiceValue({ label, value }) {
  return <Box sx={{ minWidth: 0 }}>
    <Typography sx={{ fontSize: 10, color: 'text.secondary', mb: .25 }}>{label}</Typography>
    <Typography sx={{ fontSize: 12, fontWeight: 550, overflowWrap: 'anywhere' }}>{value}</Typography>
  </Box>
}
