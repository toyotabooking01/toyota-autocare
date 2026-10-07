import { useEffect, useState } from 'react'
import { Alert, Button } from '@mui/material'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import LockOutlined from '@mui/icons-material/LockOutlined'
import MailOutlineRounded from '@mui/icons-material/MailOutlineRounded'
import api from '../services/api'
import { useAuth } from '../auth/AuthContext'
import { dashboards, errorMessage, FLOW_KEY, passwordError, readFlow, store } from '../auth/session'
import { Field, OtpInput, Steps, Submit, Success } from '../components/AuthForm'

function Heading({ title, text, mail = false }) {
  return <><span className="form-icon">{mail ? <MailOutlineRounded /> : <LockOutlined />}</span><h2>{title}</h2><p className="form-intro">{text}</p></>
}
function Notice({ error }) { return error && <Alert severity="error">{error}</Alert> }
function saveFlow(email, kind, sent = true) {
  store(FLOW_KEY, JSON.stringify({ email: email.trim().toLowerCase(), kind, resendAt: sent ? Date.now() + 60000 : 0 }))
}
export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [unverified, setUnverified] = useState(false)
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setUnverified(false)
    try {
      const user = await login(email.trim().toLowerCase(), password)
      navigate(dashboards[user.role], { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setUnverified(err.response?.status === 403)
    } finally { setBusy(false) }
  }
  return <div className="form-card"><Heading title="Welcome back." text="Sign in to your Toyota AutoCare account." />
    <form onSubmit={submit}><Notice error={error} />
      <Field label="Email address" type="email" autoComplete="username" value={email} onChange={e => { setEmail(e.target.value); setUnverified(false) }} disabled={busy} />
      <Field label="Password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} disabled={busy} />
      <Link className="forgot-link" to="/forgot-password">Forgot password?</Link>
      <Submit busy={busy}>Sign in</Submit>
      {unverified && <Button onClick={() => { saveFlow(email, 'verify', false); navigate('/verify-email') }}>Verify your email</Button>}
    </form><p className="form-bottom">New to AutoCare? <Link to="/register">Create an account</Link></p></div>
}
export function Register() {
  const navigate = useNavigate()
  const [values, setValues] = useState({ fullName: '', email: '', phone: '', password: '', confirmPassword: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [recover, setRecover] = useState(false)
  async function submit(event) {
    event.preventDefault()
    const invalid = passwordError(values.password, values.confirmPassword)
    if (invalid) return setError(invalid)
    setBusy(true); setError(''); setRecover(false)
    try {
      const { data } = await api.post('/auth/register', { ...values, email: values.email.trim().toLowerCase() })
      if (data.user?.emailVerified === true) {
        store(FLOW_KEY, null)
        navigate('/login', { replace: true })
        return
      }
      saveFlow(values.email, 'verify'); navigate('/verify-email')
    } catch (err) {
      setError(errorMessage(err))
      setRecover(!err.response || [409, 503].includes(err.response.status))
    } finally { setBusy(false) }
  }
  function field(name, label, type, autoComplete) {
    return <Field label={label} type={type} autoComplete={autoComplete} value={values[name]} disabled={busy}
      onChange={e => setValues({ ...values, [name]: e.target.value })}
      helperText={name === 'phone' ? 'Include your country code, e.g. +63 917 123 4567' : undefined} />
  }
  return <div className="form-card registration"><Steps /><h2>Create your account</h2><p className="form-intro">A little care goes a long way. Let’s get started.</p>
    <form onSubmit={submit}><Notice error={error} />
      <div className="field-grid">{field('fullName', 'Full name', 'text', 'name')}{field('email', 'Email address', 'email', 'email')}</div>
      {field('phone', 'Mobile number', 'tel', 'tel')}
      <div className="field-grid">{field('password', 'Password', 'password', 'new-password')}{field('confirmPassword', 'Confirm password', 'password', 'new-password')}</div>
      <p className="password-hint">Use at least 12 characters. A memorable passphrase works well.<br />Maximum 72 UTF-8 bytes.</p>
      <Submit busy={busy}>Create account</Submit>
      {recover && <Button onClick={() => { saveFlow(values.email, 'verify', false); navigate('/verify-email') }}>Already registered? Verify or resend your code</Button>}
    </form><p className="form-bottom">Already have an account? <Link to="/login">Sign in</Link></p></div>
}
export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() })
      saveFlow(email, 'reset'); navigate('/verify-reset')
    } catch (err) { setError(errorMessage(err)) } finally { setBusy(false) }
  }
  return <div className="form-card"><Heading title="Forgot your password?" text="Enter your email and we’ll help you get back on the road." />
    <form onSubmit={submit}><Notice error={error} /><Field label="Email address" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} disabled={busy} />
      <Submit busy={busy}>Send verification code</Submit></form>
    <p className="form-bottom"><Link to="/login">Back to sign in</Link></p></div>
}
export function VerifyCode({ reset = false, onResetGrant }) {
  const [flow] = useState(readFlow)
  const [digits, setDigits] = useState([])
  const [resendAt, setResendAt] = useState(flow.resendAt || 0)
  const [now, setNow] = useState(Date.now)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [complete, setComplete] = useState(false)
  const navigate = useNavigate()
  useEffect(() => { const interval = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(interval) }, [])
  const seconds = Math.max(0, Math.ceil((resendAt - now) / 1000))
  if (!flow.email || flow.kind !== (reset ? 'reset' : 'verify')) return <Navigate to={reset ? '/forgot-password' : '/register'} replace />
  const [local, domain] = flow.email.split('@')
  const masked = `${local.slice(0, 1)}•••@${domain}`
  async function submit(event) {
    event.preventDefault()
    const otp = digits.join('')
    if (!/^\d{6}$/.test(otp)) return setError('Enter all six digits from your email.')
    setBusy(true); setError(''); setNotice('')
    try {
      const { data } = await api.post(reset ? '/auth/verify-reset-otp' : '/auth/verify-email', { email: flow.email, otp })
      store(FLOW_KEY, null)
      if (reset) {
        onResetGrant({ email: flow.email, token: data.resetToken, expiresAt: Date.now() + data.expiresIn * 1000 })
        navigate('/reset-password', { replace: true })
      } else setComplete(true)
    } catch (err) { setError(errorMessage(err)) } finally { setBusy(false) }
  }
  async function resend() {
    setBusy(true); setError(''); setNotice('')
    try {
      await api.post(reset ? '/auth/forgot-password' : '/auth/resend-verification', { email: flow.email })
      const next = Date.now() + 60000
      setResendAt(next); store(FLOW_KEY, JSON.stringify({ ...flow, resendAt: next }))
      setDigits([]); setNotice('If your account is eligible, a new code will arrive shortly. Check your spam folder too.')
    } catch (err) {
      setError(errorMessage(err))
      if (err.response?.status === 429) {
        const next = Date.now() + (Number(err.response.headers['retry-after']) || 60) * 1000
        setResendAt(next); store(FLOW_KEY, JSON.stringify({ ...flow, resendAt: next }))
      }
    } finally { setBusy(false) }
  }
  return <div className="form-card">{!reset && <Steps active={complete ? 2 : 1} />}
    {complete ? <Success title="Account verified!" text="Your email is verified. Sign in to continue your journey." /> : <>
      <Heading title={reset ? 'Check your inbox' : 'Verify your email'} text={<>Enter the six-digit code sent to <strong>{masked}</strong>{reset && ' if your account is eligible'}.</>} mail />
      <form onSubmit={submit}><Notice error={error} />{notice && <Alert severity="info">{notice}</Alert>}
        <OtpInput value={digits} onChange={setDigits} disabled={busy} />
        <p className="password-hint">Use the latest code before the expiry shown in your email.</p>
        <Submit busy={busy}>{reset ? 'Verify code' : 'Verify email'}</Submit>
      </form><div className="resend-row"><span>Didn’t receive a code?</span><Button disabled={busy || seconds > 0} onClick={resend}>{seconds > 0 ? `Resend in ${seconds}s` : 'Resend code'}</Button></div>
      <p className="form-bottom"><Link to={reset ? '/forgot-password' : '/register'}>Use a different email</Link></p>
    </>}</div>
}
export function ResetPassword({ grant, clearGrant }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [complete, setComplete] = useState(false)
  const [now, setNow] = useState(Date.now)
  const { logout } = useAuth()
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])
  if (complete) return <div className="form-card"><Success title="Password updated" text="Your password has been reset securely. Sign in with your new password." /></div>
  if (!grant || grant.expiresAt <= now) return <div className="form-card"><Heading title="Let’s start again" text="For your security, this reset session is no longer available. Request a fresh code to continue." /><Button component={Link} to="/forgot-password" variant="contained" fullWidth>Request a new code</Button></div>
  async function submit(event) {
    event.preventDefault()
    const invalid = passwordError(password, confirmation)
    if (invalid) return setError(invalid)
    setBusy(true); setError('')
    try {
      await api.post('/auth/reset-password', { email: grant.email, resetToken: grant.token, newPassword: password, confirmPassword: confirmation })
      setComplete(true); clearGrant(); logout(); store(FLOW_KEY, null)
    } catch (err) {
      setError(errorMessage(err))
      if (err.response?.status === 400 && err.response.data?.message?.includes('reset token')) clearGrant()
    } finally { setBusy(false) }
  }
  return <div className="form-card"><Heading title="Reset your password" text="Choose a new password for your next journey." /><form onSubmit={submit}>
    <Notice error={error} /><Field label="New password" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} disabled={busy} />
    <Field label="Confirm password" type="password" autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} />
    <p className="password-hint">At least 12 characters. Maximum 72 UTF-8 bytes.</p><Submit busy={busy}>Reset password</Submit>
  </form></div>
}
