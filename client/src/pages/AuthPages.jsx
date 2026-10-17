import { useConfirmation } from '../components/ConfirmationContext'
import useFormValidation from '../components/useFormValidation'
import { useEffect, useRef, useState } from 'react'
import { validateClientForm } from '../utils/formValidation'
import { Alert, Button, MenuItem } from '@mui/material'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import LockOutlined from '@mui/icons-material/LockOutlined'
import MailOutlineRounded from '@mui/icons-material/MailOutlineRounded'
import api from '../services/api'
import { useAuth } from '../auth/AuthContext'
import { accountHome, errorMessage, FLOW_KEY, readFlow, store } from '../auth/session'
import { Field, OtpInput, Steps, Submit, Success } from '../components/AuthForm'
import RegistrationConsent, { PolicyDialog } from '../components/RegistrationConsent'
import { PASSWORD_HINT, MOBILE_PATTERN, REGISTRATION_MOBILE_HINT, NAME_SUFFIXES, normalizeMobile, restrictMobileInput } from '../../../shared/accountValidation.mjs'
import PasswordRequirements from '../components/PasswordRequirements'

function Heading({ title, text, mail = false }) {
  return <><span className="form-icon">{mail ? <MailOutlineRounded /> : <LockOutlined />}</span><h2>{title}</h2><p className="form-intro">{text}</p></>
}
function Notice({ error }) { return error && <Alert severity="error">{error}</Alert> }
function saveFlow(email, kind, sent = true) {
  store(FLOW_KEY, JSON.stringify({ email: email.trim().toLowerCase(), kind, resendAt: sent ? Date.now() + 60000 : 0 }))
}
export function Login() {
  const requestInFlight = useRef(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const validation = useFormValidation('login', { email, password })
  const [unverified, setUnverified] = useState(false)
  const [policyOpen, setPolicyOpen] = useState(false)
  async function submit(event) {
    event.preventDefault()
    if (requestInFlight.current || busy || !validation.validate()) return
    requestInFlight.current = true
    setBusy(true); setError(''); setUnverified(false)
    try {
      const user = await login(email.trim().toLowerCase(), password)
      navigate(accountHome(user), { replace: true })
    } catch (err) { validation.receive(err);
      setError(err.response?.data?.errors ? '' : errorMessage(err))
      setUnverified(err.response?.status === 403 && err.response?.data?.message === 'Verify your email before logging in.')
    } finally { requestInFlight.current = false; setBusy(false) }
  }
  return <div className="form-card"><Heading title="Welcome back." text="Sign in to your Toyota AutoCare account." />
    <form noValidate onSubmit={submit}><Notice error={error} />
      <Field label="Email address" type="email" autoComplete="username" value={email} {...validation.field('email')} onChange={e => { setEmail(e.target.value); setUnverified(false) }} disabled={busy} />
      <Field label="Password" type="password" autoComplete="current-password" value={password} {...validation.field('password')} onChange={e => setPassword(e.target.value)} disabled={busy} />
      <Link className="forgot-link" to="/forgot-password">Forgot password?</Link>
      <Submit busy={busy}>Sign in</Submit>
      {unverified && <Button onClick={() => { saveFlow(email, 'verify', false); navigate('/verify-email') }}>Verify your email</Button>}
    </form><p className="login-legal">By signing in, you agree to our{' '}
      <a href="#terms" onClick={event => { event.preventDefault(); setPolicyOpen(true) }}>Terms</a> and{' '}
      <a href="#privacy" onClick={event => { event.preventDefault(); setPolicyOpen(true) }}>Privacy Policy</a>.
    </p><p className="form-bottom">New to AutoCare? <Link to="/register">Create an account</Link></p>
    <PolicyDialog open={policyOpen} onClose={() => setPolicyOpen(false)} /></div>
}
export function Register() {
  const confirm = useConfirmation()
  const navigate = useNavigate()
  const [values, setValues] = useState({ firstName: '', lastName: '', middleName: '', suffix: '', email: '', phone: '', password: '', confirmPassword: '', termsAccepted: false })
  const [confirmationEdited, setConfirmationEdited] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const validation = useFormValidation('clientRegistration', values)
  const liveErrors = validateClientForm('clientRegistration', values)
  const [recover, setRecover] = useState(false)
  async function submit(event) {
    event.preventDefault()
    if (busy || !validation.validate()) return
    return confirm('Are you sure you want to create this account?', async () => {
      setBusy(true); setError(''); setRecover(false)
      try {
        await api.post('/auth/register', { ...values, email: values.email.trim().toLowerCase(), phone: normalizeMobile(values.phone) })
        saveFlow(values.email, 'verify'); navigate('/verify-email')
      } catch (err) {
        const labels = { firstName: 'first name', lastName: 'last name', middleName: 'middle name or initial', suffix: 'suffix', email: 'email address', phone: 'mobile number', password: 'password', confirmPassword: 'password confirmation', termsAccepted: 'agreement' }
        const safeErrors = Object.fromEntries(Object.keys(err.response?.data?.errors || {}).filter(key => labels[key]).map(key => [key,
          key === 'email' && err.response?.status === 409 ? 'An account with this email already exists.' : `Please check your ${labels[key]}.`]))
        validation.receive({ response: { data: { errors: safeErrors } } })
        setError(Object.keys(safeErrors).length ? '' : 'We could not create your account. Please try again.')
        setRecover(!err.response || [409, 503].includes(err.response.status))
      } finally { setBusy(false) }
    })
  }
  function field(name, label, type, autoComplete) {
    const props = validation.field(name)
    if (name === 'phone') {
      props.error = Boolean(validation.errors.phone || (values.phone && !MOBILE_PATTERN.test(values.phone)))
      props.helperText = props.error ? REGISTRATION_MOBILE_HINT : undefined
    }
    if (name === 'password' && values.password) { props.error = Boolean(liveErrors.password); props.helperText = liveErrors.password && liveErrors.password !== PASSWORD_HINT ? liveErrors.password : undefined }
    if (name === 'confirmPassword' && confirmationEdited) {
      props.error = values.confirmPassword !== values.password
      props.helperText = props.error ? 'Passwords do not match' : values.confirmPassword ? 'Passwords match' : undefined
    }
    return <Field {...props} label={label} type={type} autoComplete={autoComplete} value={values[name]} disabled={busy} required={name !== 'middleName'}
      slotProps={{ htmlInput: { ...(['firstName', 'lastName', 'middleName'].includes(name) ? { maxLength: name === 'middleName' ? 30 : 40 } : {}), ...(name === 'phone' ? { inputMode: 'tel' } : {}) }, formHelperText: name === 'confirmPassword' && values.confirmPassword === values.password && values.confirmPassword ? { sx: { color: 'success.main' } } : undefined }}
      onChange={e => { if (name === 'confirmPassword') setConfirmationEdited(true); setValues(current => ({ ...current, [name]: name === 'phone' ? restrictMobileInput(e.target.value) : e.target.value })) }} />
  }
  return <div className="form-card registration"><Steps /><h2>Create your account</h2><p className="form-intro">A little care goes a long way. Let’s get started.</p>
    <form noValidate onSubmit={submit}><Notice error={error} />
      <div className="field-grid">{field('firstName', 'First Name', 'text', 'given-name')}{field('lastName', 'Last Name', 'text', 'family-name')}</div>
      <div className="field-grid">{field('middleName', 'Middle Name / Initial', 'text', 'additional-name')}
        <Field {...validation.field('suffix')} label="Suffix (optional)" select required={false} value={values.suffix} disabled={busy} onChange={event => setValues(current => ({ ...current, suffix: event.target.value }))} slotProps={{ select: { displayEmpty: true } }}>
          {NAME_SUFFIXES.map(suffix => <MenuItem key={suffix || 'none'} value={suffix}>{suffix || 'None'}</MenuItem>)}
        </Field>
      </div>
      {field('email', 'Email Address', 'email', 'email')}
      {field('phone', 'Mobile number', 'tel', 'tel')}
      <div className="field-grid">{field('password', 'Password', 'password', 'new-password')}{field('confirmPassword', 'Confirm password', 'password', 'new-password')}</div>
      <PasswordRequirements password={values.password} />
      <RegistrationConsent checked={values.termsAccepted} onChange={checked => setValues(current => ({ ...current, termsAccepted: checked }))} disabled={busy} error={validation.errors.termsAccepted} />
      <Submit busy={busy}>Create account</Submit>
      {recover && <Button onClick={() => { saveFlow(values.email, 'verify', false); navigate('/verify-email') }}>Already registered? Verify or resend your code</Button>}
    </form><p className="form-bottom">Already have an account? <Link to="/login">Sign in</Link></p></div>
}
export function ForgotPassword() {
  const confirm = useConfirmation()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const validation = useFormValidation('email', { email })
  const navigate = useNavigate()
  async function submit(event) {
    event.preventDefault(); if (busy || !validation.validate()) return; return confirm('Are you sure you want to request a password reset code?', async () => {
      setBusy(true); setError('')
      try {
        await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() })
        saveFlow(email, 'reset'); navigate('/verify-reset')
      } catch (err) { validation.receive(err); setError(err.response?.data?.errors ? '' : errorMessage(err)) } finally { setBusy(false) }
    })
  }
  return <div className="form-card"><Heading title="Forgot Your Password?" text="Enter your email and we’ll help you get back on the road." />
    <form noValidate onSubmit={submit}><Notice error={error} /><Field label="Email Address" type="email" autoComplete="email" value={email} {...validation.field('email')} onChange={e => setEmail(e.target.value)} disabled={busy} />
      <Submit busy={busy}>Send Verification Code</Submit></form>
    <p className="form-bottom"><Link to="/login">Back to Sign In</Link></p></div>
}
export function VerifyCode({ reset = false, onResetGrant }) {
  const [flow] = useState(readFlow)
  const requestInFlight = useRef(false)
  const [digits, setDigits] = useState([])
  const [resendAt, setResendAt] = useState(flow.resendAt || 0)
  const [now, setNow] = useState(Date.now)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const validation = useFormValidation('otp', { email: flow.email, otp: digits.join('') })
  const [complete, setComplete] = useState(false)
  const navigate = useNavigate()
  useEffect(() => { const interval = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(interval) }, [])
  const seconds = Math.max(0, Math.ceil((resendAt - now) / 1000))
  if (Object.keys(validateClientForm('email', { email: flow.email })).length > 0 || flow.kind !== (reset ? 'reset' : 'verify')) return <Navigate to={reset ? '/forgot-password' : '/register'} replace />
  const [local, domain] = flow.email.split('@')
  const masked = `${local.slice(0, 1)}•••@${domain}`
  async function submit(event) {
    event.preventDefault()
    if (requestInFlight.current || busy || !validation.validate()) return
    const otp = digits.join('')
    requestInFlight.current = true
    setBusy(true); setError(''); setNotice('')
    try {
      const { data } = await api.post(reset ? '/auth/verify-reset-otp' : '/auth/verify-email', { email: flow.email, otp })
      store(FLOW_KEY, null)
      if (reset) {
        onResetGrant({ email: flow.email, token: data.resetToken, expiresAt: Date.now() + data.expiresIn * 1000 })
        navigate('/reset-password', { replace: true })
      } else setComplete(true)
    } catch (err) { validation.receive(err); setError(err.response?.data?.errors ? '' : errorMessage(err)) } finally { requestInFlight.current = false; setBusy(false) }
  }
  async function resend() {
    if (requestInFlight.current || busy || seconds > 0) return
    requestInFlight.current = true
    setBusy(true); setError(''); setNotice('')
    try {
      await api.post(reset ? '/auth/forgot-password' : '/auth/resend-verification', { email: flow.email })
      const next = Date.now() + 60000
      setResendAt(next); store(FLOW_KEY, JSON.stringify({ ...flow, resendAt: next }))
      validation.reset(); setDigits([]); setNotice('If your account is eligible, a new code will arrive shortly. Check your spam folder too.')
    } catch (err) { validation.receive(err);
      setError(err.response?.data?.errors ? '' : errorMessage(err))
      if (err.response?.status === 429) {
        const next = Date.now() + (Number(err.response.headers['retry-after']) || 60) * 1000
        setResendAt(next); store(FLOW_KEY, JSON.stringify({ ...flow, resendAt: next }))
      }
    } finally { requestInFlight.current = false; setBusy(false) }
  }
  return <div className="form-card">{!reset && <Steps active={complete ? 2 : 1} />}
    {complete ? <Success title="Account verified!" text="Your email is verified. Sign in to continue your journey." /> : <>
      <Heading title={reset ? 'Check your inbox' : 'Verify your email'} text={<>Enter the six-digit code sent to <strong>{masked}</strong>{reset && ' if your account is eligible'}.</>} mail />
      <form noValidate onSubmit={submit}><Notice error={error} />{notice && <Alert severity="info">{notice}</Alert>}
        <OtpInput value={digits} onChange={value => { setDigits(value); setError('') }} disabled={busy} error={validation.errors.otp} />
        <p className="password-hint">Use the latest code before the expiry shown in your email.</p>
        <Submit busy={busy}>{reset ? 'Verify code' : 'Verify email'}</Submit>
      </form><div className="resend-row"><span>Didn’t receive a code?</span><Button disabled={busy || seconds > 0} onClick={resend}>{seconds > 0 ? `Resend in ${seconds}s` : 'Resend code'}</Button></div>
      <p className="form-bottom"><Link to={reset ? '/forgot-password' : '/register'}>Use a different email</Link></p>
    </>}</div>
}
export function ResetPassword({ grant, clearGrant }) {
  const confirm = useConfirmation()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const validation = useFormValidation('reset', { newPassword: password, confirmPassword: confirmation })
  const [complete, setComplete] = useState(false)
  const [now, setNow] = useState(Date.now)
  const { logout } = useAuth()
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])
  if (complete) return <div className="form-card"><Success title="Password updated" text="Your password has been reset securely. Sign in with your new password." /></div>
  if (!grant || grant.expiresAt <= now) return <div className="form-card"><Heading title="Let’s start again" text="For your security, this reset session is no longer available. Request a fresh code to continue." /><Button component={Link} to="/forgot-password" variant="contained" fullWidth>Request a new code</Button></div>
  async function submit(event) {
    event.preventDefault()
    if (busy || !validation.validate()) return
    return confirm('Are you sure you want to update your password?', async () => {
        if (grant.expiresAt <= Date.now()) { clearGrant(); return }
      setBusy(true); setError('')
      try {
        await api.post('/auth/reset-password', { email: grant.email, resetToken: grant.token, newPassword: password, confirmPassword: confirmation })
        setComplete(true); clearGrant(); logout(); store(FLOW_KEY, null)
      } catch (err) { validation.receive(err);
        setError(err.response?.data?.errors ? '' : errorMessage(err))
        if (err.response?.status === 400 && err.response.data?.message?.includes('reset token')) clearGrant()
      } finally { setBusy(false) }
    })
  }
  return <div className="form-card"><Heading title="Reset your password" text="Choose a new password for your next journey." /><form noValidate onSubmit={submit}>
    <Notice error={error} /><Field label="New password" type="password" autoComplete="new-password" value={password} {...validation.field('newPassword')} onChange={e => setPassword(e.target.value)} disabled={busy} />
    <Field label="Confirm password" type="password" autoComplete="new-password" value={confirmation} {...validation.field('confirmPassword')} onChange={e => setConfirmation(e.target.value)} disabled={busy} />
    <p className="password-hint">{PASSWORD_HINT}</p><Submit busy={busy}>Reset password</Submit>
  </form></div>
}
