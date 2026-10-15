import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'
import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded'
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded'
import { DetailInfo } from './RecordDetails'

export default function MechanicCreatedDialog({ result, onClose }) {
  const sent = result?.emailSent === true
  const Icon = sent ? CheckCircleOutlineRounded : ErrorOutlineRounded
  return <Dialog open={Boolean(result)} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="mechanic-created-title"
    slotProps={{ paper: { sx: { borderRadius: '16px', border: '1px solid var(--line)' } } }}>
    <DialogTitle id="mechanic-created-title" sx={{ p: 3, pb: 2 }}>Mechanic account created</DialogTitle>
    <DialogContent sx={{ px: 3, pb: 3 }}>
      <DetailInfo items={[["Mechanic ID", result?.item?.employeeId], ["Email", result?.item?.email]]} />
      <Box role="status" sx={{ display: 'flex', gap: 1, mt: 2.5, alignItems: 'flex-start', color: sent ? 'success.main' : 'warning.main' }}>
        <Icon sx={{ fontSize: 19, mt: .2 }} /><Typography sx={{ fontSize: 13 }}>{sent ? "Login credentials sent to the mechanic's email." : 'The account was created, but the login credentials email could not be sent.'}</Typography>
      </Box>
      <Typography sx={{ mt: 1, fontSize: 12, color: 'text.secondary' }}>{sent
        ? 'The mechanic must change the temporary password on first login.'
        : 'Do not create another account. Ask the mechanic to use Forgot password when email delivery is available.'}</Typography>
    </DialogContent>
    <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid var(--line)' }}><Button onClick={onClose}>Close</Button></DialogActions>
  </Dialog>
}
