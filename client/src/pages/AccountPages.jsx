import { useState } from 'react'
import { Alert, Avatar, Box, Button, Checkbox, FormControlLabel, Paper, Radio, RadioGroup, Stack, Tab, Tabs, TextField, Typography } from '@mui/material'
import SecuritySettings from '../components/SecuritySettings'
import { useAuth } from '../auth/AuthContext'
import { useColorMode } from '../components/ColorModeContext'
import { roleLabels } from '../app/navigation'
import { userInitials } from '../utils/userInitials'
import { errorMessage } from '../auth/session'
import { validateForm } from '../utils/validationRules'
import { normalizeMobile, restrictMobileInput } from '../../../shared/accountValidation.mjs'
import { workspaceCardWidth } from '../layouts/workspaceDimensions'
import { DetailInfo, DetailSection } from '../components/RecordDetails'

const panel = { ...workspaceCardWidth, p: { xs: 2, sm: 3 }, border: '1px solid var(--line)', boxShadow: 'none' }
const notifications = {
  client: ['Booking reminders', 'Booking and service status updates', 'Maintenance reminders', 'General notifications'],
  admin: ['New booking notifications', 'Booking cancellation notifications', 'System and account notifications'],
  staff: ['New booking notifications', 'Booking and service status updates', 'Customer arrival reminders'],
  mechanic: ['New assigned service and job notifications', 'Schedule reminders', 'Service and task status reminders'],
}
const fieldLabels = { firstName: 'First Name', lastName: 'Last Name', phone: 'Phone Number', address: 'Address' }

function Heading({ title, description }) {
  return <Box sx={{ mb: 2.5 }}><Typography component="h1" variant="h4" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700 }}>{title}</Typography>
    {description && <Typography sx={{ color: 'text.secondary', mt: .5, fontSize: 14 }}>{description}</Typography>}</Box>
}

export function MyProfile({ role }) {
  const { user } = useAuth()
  const rows = [
    ['Full Name', user.fullName], ['Email Address', user.email], ['Phone Number', user.phone],
    ...(role === 'client' ? [['Address', user.address || 'Not provided']] : []), ['Account Role', roleLabels[role]],
    ...(role === 'mechanic' ? [['Employee ID', user.employeeId], ['Specialization', user.specialization?.join(', ')], ['Availability', user.availability?.replaceAll('_', ' ')]] : []),
    ...(role === 'staff' ? [['Staff ID', user.staffId || 'Not assigned']] : []),
    ...(user.createdAt ? [['Account created', new Date(user.createdAt).toLocaleDateString()]] : []),
  ].filter(([, value]) => value !== undefined && value !== null && value !== '')
  return <><Heading title="My Profile" description="Your account information" />
    <Paper variant="outlined" sx={panel}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
        <Avatar sx={{ bgcolor: 'var(--avatar-fill)', color: 'var(--avatar-ink)', width: 48, height: 48 }}>{userInitials(user.fullName)}</Avatar>
        <Box><Typography sx={{ fontWeight: 700 }}>{user.fullName}</Typography><Typography color="text.secondary" fontSize={13}>{roleLabels[role]}</Typography></Box>
      </Stack>
      <DetailSection title="Profile Information"><DetailInfo items={rows} /></DetailSection>
    </Paper>
  </>
}

function ProfileSettings({ role }) {
  const { user, updateProfile } = useAuth()
  const [form, setForm] = useState(() => ({ firstName: user.firstName || '', lastName: user.lastName || '', phone: user.phone || '', ...(role === 'client' ? { address: user.address || '' } : {}) }))
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [noticeError, setNoticeError] = useState(false)
  async function submit(event) {
    event.preventDefault()
    const normalized = { ...form, phone: normalizeMobile(form.phone) }
    const nextErrors = validateForm('accountProfile', normalized, { browser: true, skip: role === 'client' ? [] : ['address'] })
    setErrors(nextErrors); setNotice(''); setNoticeError(false)
    if (Object.keys(nextErrors).length) return
    setBusy(true)
    try {
      await updateProfile(normalized)
      setForm(normalized); setNotice('Profile changes saved.')
    } catch (error) {
      setErrors(error.response?.data?.errors || {})
      setNotice(errorMessage(error)); setNoticeError(true)
    } finally { setBusy(false) }
  }
  return <Box component="form" noValidate onSubmit={submit}>
    <Typography variant="h6" sx={{ fontSize: 18, mb: 1 }}>Profile</Typography>
    <Typography color="text.secondary" fontSize={13} sx={{ mb: 2 }}>Your email address is your account login and cannot be changed here.</Typography>
    {notice && <Alert severity={noticeError ? 'error' : 'success'} sx={{ mb: 2 }}>{notice}</Alert>}
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
      {Object.keys(form).map(key => <TextField key={key} required={key !== 'address'} label={fieldLabels[key]} type={key === 'phone' ? 'tel' : 'text'}
        autoComplete={{ firstName: 'given-name', lastName: 'family-name', phone: 'tel', address: 'street-address' }[key]} value={form[key]}
        error={Boolean(errors[key])} helperText={errors[key] || (key === 'phone' ? 'Use 09XXXXXXXXX or +639XXXXXXXXX.' : '')}
        onChange={event => { const value = key === 'phone' ? restrictMobileInput(event.target.value) : event.target.value; setForm(current => ({ ...current, [key]: value })); setErrors(current => ({ ...current, [key]: '' })) }}
        disabled={busy} slotProps={{ htmlInput: { maxLength: key === 'address' ? 300 : key === 'phone' ? 20 : 40 } }} />)}
      <TextField label="Email Address" type="email" autoComplete="email" value={user.email || ''} disabled />
    </Box>
    <Button type="submit" variant="contained" disabled={busy} sx={{ mt: 2.5 }}>Save Changes</Button>
  </Box>
}

function NotificationSettings({ role }) {
  return <><Typography variant="h6" sx={{ fontSize: 18, mb: 1 }}>Notifications</Typography>
    <Alert severity="info" sx={{ mb: 2 }}>Notification preferences are not saved yet. Preference storage is not available in this system.</Alert>
    <Stack spacing={1}>{notifications[role].map(label => <FormControlLabel key={label} disabled control={<Checkbox />} label={label} />)}</Stack>
  </>
}

function AppearanceSettings() {
  const { preference, setPreference } = useColorMode()
  return <><Typography variant="h6" sx={{ fontSize: 18, mb: 1 }}>Appearance</Typography>
    <Typography color="text.secondary" fontSize={13} sx={{ mb: 1 }}>Choose how Toyota AutoCare looks on this device.</Typography>
    <RadioGroup aria-label="Color theme" value={preference} onChange={event => setPreference(event.target.value)}>
      <FormControlLabel value="light" control={<Radio />} label="Light" /><FormControlLabel value="dark" control={<Radio />} label="Dark" />
      <FormControlLabel value="system" control={<Radio />} label="System Default" />
    </RadioGroup></>
}

export function AccountSettings({ role }) {
  const [tab, setTab] = useState(0)
  return <><Heading title="Account Settings" description="Manage your profile, security and display preferences." />
    <Paper variant="outlined" className="settings-panel" sx={panel}>
      <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto" aria-label="Account settings sections"
        sx={{ mb: 3, borderBottom: '1px solid var(--line)', maxWidth: '100%' }}>
        {['Profile', 'Security', 'Notifications', 'Appearance'].map(label => <Tab key={label} label={label} />)}
      </Tabs>
      <Box role="tabpanel" aria-label={['Profile', 'Security', 'Notifications', 'Appearance'][tab]} sx={workspaceCardWidth}>
        {tab === 0 ? <ProfileSettings role={role} /> : tab === 1 ? <SecuritySettings /> : tab === 2 ? <NotificationSettings role={role} /> : <AppearanceSettings />}
      </Box>
    </Paper>
  </>
}

export function HelpSupport() {
  return <><Heading title="Help & Support" description="Toyota AutoCare Support" />
    <Paper variant="outlined" sx={panel}><Alert severity="info">Support contact details have not been configured yet.</Alert>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mt: 3 }}>
        {[['Contact number', 'To be configured'], ['Email', 'To be configured'], ['Business hours', 'To be configured']].map(([label, value]) =>
          <Box key={label}><Typography fontSize={12} color="text.secondary">{label}</Typography><Typography>{value}</Typography></Box>)}
      </Box>
    </Paper>
  </>
}
