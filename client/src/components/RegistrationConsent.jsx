import { useState } from 'react'
import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormHelperText, Link, Typography } from '@mui/material'

const documents = {
  terms: { title: 'Terms of Service', sections: [
    ['About this system', 'Toyota AutoCare is a university automotive service-booking project for managing accounts, vehicles, appointments, and service updates. It is not an official Toyota corporate service.'],
    ['Your account', 'Provide accurate contact and vehicle information, keep your password and verification codes private, and use only your own account. Do not misuse the system or access another person’s information.'],
    ['Bookings and services', 'Bookings depend on available schedules and confirmation by the service team. Review appointment details and contact the service team when your plans change. Displayed estimates are not final charges.'],
    ['Questions and support', 'For help with your account, a booking, or these terms, contact the university project administrator or the service team through your university’s established support channel.'],
  ] },
  privacy: { title: 'Privacy Policy', sections: [
    ['Information used', 'The system uses your name, email, mobile number, vehicle details, bookings, and service history to manage your account and appointments. It also records when you accept these terms and this policy.'],
    ['How information is used', 'Contact information supports account verification, password recovery, and service updates. Administrators and assigned service staff access information needed for their responsibilities. Email delivery uses the configured email provider.'],
    ['Responsible handling', 'Do not submit unnecessary sensitive information in service notes. Records should be retained only as needed for service, project administration, and applicable university requirements.'],
    ['Your questions and requests', 'Contact the university project administrator through the university’s established support channel to ask about access, correction, or deletion of your information. Some service records may need to be retained under applicable requirements.'],
  ] },
}

export function PolicyDialog({ open, onClose }) {
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="registration-document-title">
    <DialogTitle id="registration-document-title">Terms of Service &amp; Privacy Policy</DialogTitle>
    <DialogContent dividers>{Object.entries(documents).map(([key, content]) => <Box component="section" key={key} aria-labelledby={`policy-${key}`} sx={{ '& + section': { borderTop: '1px solid', borderColor: 'divider', pt: 3, mt: 3 } }}>
      <Typography component="h2" id={`policy-${key}`} sx={{ fontWeight: 700, fontSize: 19, mb: 2 }}>{content.title}</Typography>
      {content.sections.map(([title, text]) => <Box key={title} sx={{ mb: 2 }}><Typography component="h3" sx={{ fontWeight: 700, fontSize: 15, mb: .5 }}>{title}</Typography><Typography sx={{ fontSize: 14, color: 'text.secondary', lineHeight: 1.7 }}>{text}</Typography></Box>)}
    </Box>)}</DialogContent>
    <DialogActions><Button type="button" onClick={onClose}>Close</Button></DialogActions>
  </Dialog>
}

export default function RegistrationConsent({ checked, onChange, disabled, error }) {
  const [open, setOpen] = useState(false)
  const [ready, setReady] = useState(false)
  function openPolicy() { setOpen(true); setReady(true) }
  return <>
    <FormControl className="registration-consent" error={Boolean(error)}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: .5 }}>
        <Checkbox checked={checked} disabled={disabled || !ready} onChange={event => { if (ready) onChange(event.target.checked) }} name="termsAccepted"
          slotProps={{ input: { 'aria-labelledby': 'registration-consent-label', 'aria-describedby': error ? 'registration-consent-error' : undefined, 'aria-invalid': Boolean(error), required: true } }} sx={{ p: .5, mt: -.4 }} />
        <Typography id="registration-consent-label" sx={{ fontSize: 13, lineHeight: 1.7 }}>I have read and agree to the{' '}
          <Link component="button" type="button" disabled={disabled} onClick={openPolicy} sx={{ font: 'inherit', verticalAlign: 'baseline' }}>Terms of Service &amp; Privacy Policy</Link>.
        </Typography>
      </Box>
      {!ready && <FormHelperText>Open the policy to enable agreement.</FormHelperText>}
      {error && <FormHelperText id="registration-consent-error">{error}</FormHelperText>}
    </FormControl>
    <PolicyDialog open={open} onClose={() => setOpen(false)} />
  </>
}
