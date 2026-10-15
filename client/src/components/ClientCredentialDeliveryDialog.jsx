import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material'
import CheckRounded from '@mui/icons-material/CheckRounded'
import { DetailInfo } from './RecordDetails'
import api from '../services/api'
import { errorMessage } from '../auth/session'

export default function ClientCredentialDeliveryDialog({ account, deliveryToken, emailSent: initialSent, onClose }) {
  const [emailSent, setEmailSent] = useState(initialSent === true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(Date.now)
  const inFlight = useRef(false)
  const seconds = Math.max(0, Math.ceil((resendAt - now) / 1000))
  useEffect(() => {
    if (!resendAt) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [resendAt])
  async function resend() {
    if (inFlight.current || seconds) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      const { data } = await api.post(`/bookings/walk-in/clients/${account.id}/resend-credentials`, { deliveryToken })
      setEmailSent(data.emailSent === true)
      const time = Date.now(); setNow(time); setResendAt(time + (data.resendAfter || 0) * 1000)
    } catch (requestError) { setError(errorMessage(requestError)) }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <Dialog open onClose={() => { if (!busy) onClose() }} fullWidth maxWidth="sm" aria-labelledby="client-credentials-title">
    <DialogTitle id="client-credentials-title">Client account created</DialogTitle>
    <DialogContent sx={{ '&&': { pt: 1 }, display: 'grid', gap: 2 }}>
      <DetailInfo items={[["Customer", account.fullName], ["Email", account.email]]} />
      {error ? <Alert severity="error">{error}</Alert> : emailSent ? <Stack direction="row" spacing={.75} role="status" sx={{ color: 'success.main', alignItems: 'center' }}>
        <CheckRounded fontSize="small" /><Typography sx={{ fontSize: 13, fontWeight: 600 }}>Login credentials sent successfully</Typography>
      </Stack> : <Alert severity="warning">Client account created, but the temporary password email could not be delivered.</Alert>}
      <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
        {emailSent && !error ? 'The customer must use the temporary password sent to their email and change it on first login.'
          : 'Retry sending the login credentials to the registered email. The customer must change the temporary password on first login.'}
      </Typography>
      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Each resend creates a new temporary password. The customer should use the latest email.</Typography>
      {seconds > 0 && <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Resend available in {seconds}s</Typography>}
    </DialogContent>
    <DialogActions sx={{ p: 2.5, borderTop: '1px solid var(--line)', flexWrap: 'wrap', gap: 1 }}>
      <Button disabled={busy || seconds > 0 || !deliveryToken} variant="outlined" onClick={resend}>
        {busy ? 'Sending…' : emailSent && !error ? 'Resend credentials' : 'Retry sending email'}
      </Button>
      <Button disabled={busy} variant="contained" onClick={onClose}>Close</Button>
    </DialogActions>
  </Dialog>
}
