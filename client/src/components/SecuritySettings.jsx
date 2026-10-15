import { useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, IconButton, InputAdornment, LinearProgress, Stack, TextField, Typography } from '@mui/material'
import CheckRounded from '@mui/icons-material/CheckRounded'
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined'
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined'
import { useAuth } from '../auth/AuthContext'
import { errorMessage } from '../auth/session'
import api from '../services/api'
import { OtpInput } from './AuthForm'
import { passwordError, passwordRequirements } from '../../../shared/accountValidation.mjs'

const emptyForm = { currentPassword: '', newPassword: '', confirmPassword: '' }
const steps = ['Verify password', 'Verify email', 'New password']

function Status({ children }) {
  return <Stack direction="row" spacing={.75} alignItems="center" role="status" sx={{ color: 'success.main', fontSize: 13 }}>
    <CheckRounded sx={{ fontSize: 17 }} /><span>{children}</span>
  </Stack>
}

export default function SecuritySettings() {
  const { changePassword } = useAuth()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(emptyForm)
  const [digits, setDigits] = useState([])
  const [visible, setVisible] = useState({})
  const [errors, setErrors] = useState({})
  const [requestError, setRequestError] = useState('')
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState(false)
  const [resendAt, setResendAt] = useState(0)
  const [grant, setGrant] = useState(null)
  const [now, setNow] = useState(Date.now)
  const inFlight = useRef(false)
  const seconds = Math.max(0, Math.ceil((resendAt - now) / 1000))
  const requirements = passwordRequirements(form.newPassword)
  const met = requirements.filter(rule => rule.met).length
  const strength = !passwordError(form.newPassword) ? 'Strong' : met >= 3 ? 'Fair' : 'Weak'

  useEffect(() => {
    if (step === 0) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [step])
  useEffect(() => {
    if (!success) return
    const timer = setTimeout(() => { setSuccess(false); setStep(0) }, 4000)
    return () => clearTimeout(timer)
  }, [success])

  function change(key, value) {
    setForm(current => ({ ...current, [key]: value }))
    setErrors(current => ({ ...current, [key]: '' }))
  }
  async function sendCode() {
    const { data } = await api.post('/auth/change-password/request-code', { currentPassword: form.currentPassword })
    const time = Date.now()
    setResendAt(time + (data.resendAfter || 60) * 1000); setNow(time)
    setDigits([]); setStep(1)
  }
  async function run(action) {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setRequestError(''); setErrors({})
    try { await action() }
    catch (error) {
      const fields = error.response?.data?.errors
      if (fields?.verificationToken) {
        setForm(emptyForm); setDigits([]); setGrant(null); setVisible({}); setStep(0)
        setRequestError('Verification has expired. Verify your current password and email again.')
      } else if (fields) {
        setErrors(fields)
        if (fields.currentPassword) { setStep(0); setDigits([]) }
      } else setRequestError(errorMessage(error))
    } finally { inFlight.current = false; setBusy(false) }
  }
  async function submit(event) {
    event.preventDefault()
    if (inFlight.current) return
    const next = {}
    if (step === 0 && !form.currentPassword) next.currentPassword = 'Current password is required.'
    if (step === 1 && !/^\d{6}$/.test(digits.join(''))) next.otp = 'Enter the 6-digit verification code.'
    if (step === 2) {
      const policyError = passwordError(form.newPassword)
      if (policyError) next.newPassword = policyError.includes('Use at least') ? 'Password does not meet the requirements.' : policyError
      if (!form.confirmPassword) next.confirmPassword = 'Confirm your new password.'
      else if (form.confirmPassword !== form.newPassword) next.confirmPassword = 'Passwords do not match.'
    }
    setErrors(next); setRequestError('')
    if (Object.keys(next).length) return
    await run(async () => {
      if (step === 0) await sendCode()
      else if (step === 1) {
        const { data } = await api.post('/auth/change-password/verify-code', { otp: digits.join('') })
        setGrant({ token: data.verificationToken, expiresAt: Date.now() + data.expiresIn * 1000 })
        setDigits([]); setForm(emptyForm); setVisible({}); setStep(2)
      } else {
        if (!grant || Date.now() >= grant.expiresAt) {
          setForm(emptyForm); setGrant(null); setVisible({}); setStep(0)
          setRequestError('Verification has expired. Verify your current password and email again.')
          return
        }
        await changePassword({ verificationToken: grant.token, newPassword: form.newPassword, confirmPassword: form.confirmPassword })
        setForm(emptyForm); setDigits([]); setGrant(null); setVisible({}); setSuccess(true)
      }
    })
  }
  function passwordField(key, label) {
    return <TextField key={key} name={key} required fullWidth label={label} type={visible[key] ? 'text' : 'password'}
      value={form[key]} disabled={busy} error={Boolean(errors[key])} helperText={errors[key]}
      autoComplete={key === 'currentPassword' ? 'current-password' : 'new-password'}
      onChange={event => change(key, event.target.value)}
      slotProps={{ input: { endAdornment: <InputAdornment position="end"><IconButton size="small" disabled={busy}
        aria-label={`${visible[key] ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
        onClick={() => setVisible(current => ({ ...current, [key]: !current[key] }))}>
        {visible[key] ? <VisibilityOffOutlined fontSize="small" /> : <VisibilityOutlined fontSize="small" />}
      </IconButton></InputAdornment> } }} />
  }

  return <>
    <Typography component="h2" sx={{ fontSize: 18, fontWeight: 650, mb: 2 }}>Security</Typography>
    <Box className="security-card" sx={{ width: '100%', maxWidth: 'none', minWidth: 0, boxSizing: 'border-box',
      '& .MuiOutlinedInput-root': { minHeight: 46 }, '& .MuiOutlinedInput-input': { py: '12px' },
      '& .otp-inputs': { display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 48px))', gap: 1, width: '100%', maxWidth: 328, margin: 0 },
      '& .otp-inputs input': { width: '100%', minWidth: 0, height: 48, boxSizing: 'border-box', border: '1px solid var(--line)',
        borderRadius: '8px', background: 'var(--surface-soft)', color: 'text.primary', fontFamily: 'inherit', fontSize: 20, textAlign: 'center', padding: 0,
        '&:focus-visible': { outline: '2px solid', outlineColor: 'text.secondary', outlineOffset: 2 },
        '&[aria-invalid="true"]': { borderColor: 'error.main' }, '&:disabled': { opacity: .6 } },
    }}>
      <Box className="security-form" sx={{ width: '100%', maxWidth: 680, minWidth: 0 }}>
      <Typography component="h3" sx={{ fontSize: 20, fontWeight: 700 }}>Change Password</Typography>
      <Typography color="text.secondary" fontSize={13} sx={{ mt: .75, mb: 2.5 }}>
        For your security, verify your current password and email before creating a new password.
      </Typography>
      <Box component="ol" aria-label="Password change progress" sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 1, listStyle: 'none', p: 0, mt: 0, mb: 3 }}>
        {steps.map((label, index) => <Box component="li" key={label} aria-current={!success && index === step ? 'step' : undefined}
          sx={{ display: 'flex', alignItems: 'center', gap: .75, minWidth: 0, color: index <= step ? 'text.primary' : 'text.secondary', fontSize: { xs: 11, sm: 12 }, fontWeight: index === step ? 650 : 400 }}>
          <Box component="span" aria-label={success || index < step ? 'Complete' : index === step ? 'Current' : 'Upcoming'}
            sx={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', border: '1px solid', borderColor: index <= step ? 'text.secondary' : 'divider',
              display: 'grid', placeItems: 'center', bgcolor: index === step ? 'action.selected' : 'transparent', fontSize: 10 }}>
            {success || index < step ? <CheckRounded sx={{ fontSize: 14 }} /> : index + 1}
          </Box>{label}
        </Box>)}
      </Box>
      {success ? <Stack spacing={.75}><Status>Password updated</Status>
        <Typography color="text.secondary" fontSize={13}>Your password has been changed successfully.</Typography></Stack>
        : <Box component="form" noValidate onSubmit={submit} aria-busy={busy}>
          <Stack spacing={2}>
            {requestError && <Alert severity="error" sx={{ py: 0, fontSize: 13 }}>{requestError}</Alert>}
            {step === 0 && passwordField('currentPassword', 'Current Password')}
            {step === 1 && <>
              <Status>Verification code sent</Status>
              <Box><Typography component="h4" sx={{ fontSize: 15, fontWeight: 650 }}>Verification code</Typography>
                <Typography color="text.secondary" fontSize={13} sx={{ mt: .5, mb: 2 }}>We sent a 6-digit code to your registered email.</Typography>
                <OtpInput value={digits} disabled={busy} error={errors.otp} onChange={value => { setDigits(value); setErrors(current => ({ ...current, otp: '' })) }} />
              </Box>
            </>}
            {step === 2 && <>
              <Status>Email verified</Status>
              {passwordField('newPassword', 'New Password')}
              <Box>
                <Typography fontSize={12} color="text.secondary" sx={{ mb: 1 }}>Password must contain:</Typography>
                <Box component="ul" className="password-requirements" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: .5 }}>
                  {requirements.map(rule => <Box component="li" key={rule.label} data-met={rule.met} sx={{ display: 'flex', gap: .75, alignItems: 'center',
                    color: rule.met ? 'success.main' : 'text.secondary', fontSize: 12 }}>
                    <Box component="span" aria-label={rule.met ? 'Met' : 'Not met'} sx={{ width: 16, display: 'grid', placeItems: 'center' }}>
                      {rule.met ? <CheckRounded sx={{ fontSize: 15 }} /> : '○'}
                    </Box>{rule.label}
                  </Box>)}
                </Box>
                {form.newPassword && <Box sx={{ mt: 1.5, maxWidth: 240 }}>
                  <Typography fontSize={11} color="text.secondary" sx={{ mb: .5 }} aria-live="polite">Password strength: {strength}</Typography>
                  <LinearProgress variant="determinate" value={met / 5 * 100} aria-label="Password strength"
                    sx={{ height: 3, borderRadius: 2, bgcolor: 'action.selected', '& .MuiLinearProgress-bar': { bgcolor: strength === 'Strong' ? 'success.main' : 'text.secondary' } }} />
                </Box>}
              </Box>
              {passwordField('confirmPassword', 'Confirm New Password')}
            </>}
            <Box sx={{ pt: .5 }}><Button type="submit" variant="contained" disabled={busy} sx={{ height: 42, minHeight: 42, width: { xs: '100%', sm: 'auto' } }}>
              {busy ? 'Please wait…' : ['Send verification code', 'Verify code', 'Change password'][step]}
            </Button></Box>
            {step === 1 && (seconds > 0 ? <Typography color="text.secondary" fontSize={12} aria-live="off">Resend code in {seconds}s</Typography>
              : <Button type="button" size="small" disabled={busy} onClick={() => run(sendCode)} sx={{ alignSelf: 'flex-start', minHeight: 32, p: 0 }}>Resend code</Button>)}
          </Stack>
        </Box>}
      </Box>
    </Box>
  </>
}
