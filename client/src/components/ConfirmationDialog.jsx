import { useId, useRef } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material'

export default function ConfirmationDialog({ open, message, details, title = 'Confirm action', confirmLabel = 'Yes', cancelLabel = 'No', busy = false, error, onConfirm, onCancel }) {
  const id = useId()
  const executing = useRef(false)
  async function approve() {
    if (busy || executing.current) return
    executing.current = true
    try { await onConfirm() } finally { executing.current = false }
  }
  return <Dialog open={open} onClose={() => { if (!busy && !executing.current) onCancel() }}
    disableEscapeKeyDown={busy} fullWidth maxWidth="xs" aria-labelledby={`${id}-title`} aria-describedby={`${id}-message`}>
    <DialogTitle id={`${id}-title`}>{title}</DialogTitle>
    <DialogContent>
      <DialogContentText id={`${id}-message`} sx={{ fontSize: 14, color: 'text.primary' }}>{message}</DialogContentText>
      {details && <DialogContentText sx={{ fontSize: 13, mt: 1 }}>{details}</DialogContentText>}
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    </DialogContent>
    <DialogActions sx={{ p: 2 }}>
      <Button type="button" autoFocus disabled={busy} onClick={() => { if (!executing.current) onCancel() }}>{cancelLabel}</Button>
      <Button type="button" variant="contained" disabled={busy} onClick={approve}>{busy ? 'Please wait…' : confirmLabel}</Button>
    </DialogActions>
  </Dialog>
}
