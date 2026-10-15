import { useRef, useState } from 'react'
import { Alert, Button } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { accountHome } from '../auth/session'
import { Field } from '../components/AuthForm'
import PasswordRequirements from '../components/PasswordRequirements'
import useFormValidation from '../components/useFormValidation'
import { passwordError } from '../../../shared/accountValidation.mjs'

export default function ForcedPasswordChange() {
  const { user, changeTemporaryPassword, logout } = useAuth()
  const navigate = useNavigate()
  const [values, setValues] = useState({ newPassword: '', confirmPassword: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  const validation = useFormValidation('reset', values)
  const matches = Boolean(values.confirmPassword) && values.confirmPassword === values.newPassword
  async function submit(event) {
    event.preventDefault()
    if (inFlight.current || !validation.validate()) return
    inFlight.current = true
    setBusy(true); setError('')
    try {
      const user = await changeTemporaryPassword(values)
      navigate(accountHome(user), { replace: true })
    } catch (requestError) {
      const status = requestError.response?.status
      setError(status === 409 ? 'Your account changed. Please sign out and sign in again.'
        : status === 400 ? 'Choose a different password that meets all requirements and matches the confirmation.'
          : 'We could not update your password. Please try again.')
    } finally { inFlight.current = false; setBusy(false) }
  }
  return <div className="form-card">
    <h2>{user?.role === 'staff' ? 'Set your new password' : 'Choose your new password'}</h2>
    <p className="form-intro">Replace your temporary password to continue to Toyota AutoCare.</p>
    <form noValidate onSubmit={submit}>
      {error && <Alert severity="error">{error}</Alert>}
      <Field label="New password" type="password" autoComplete="new-password" value={values.newPassword}
        {...validation.field('newPassword')} disabled={busy}
        onChange={event => { setValues({ ...values, newPassword: event.target.value }); setError('') }} />
      <Field label="Confirm new password" type="password" autoComplete="new-password" value={values.confirmPassword}
        {...validation.field('confirmPassword')} disabled={busy}
        error={Boolean(values.confirmPassword && !matches) || Boolean(validation.errors.confirmPassword)}
        helperText={values.confirmPassword ? matches ? 'Passwords match' : 'Passwords do not match' : validation.errors.confirmPassword}
        slotProps={{ formHelperText: matches ? { sx: { color: 'success.main' } } : undefined }}
        onChange={event => { setValues({ ...values, confirmPassword: event.target.value }); setError('') }} />
      <PasswordRequirements password={values.newPassword} />
      <Button type="submit" variant="contained" disabled={busy || Boolean(passwordError(values.newPassword)) || !matches}>{busy ? 'Saving…' : user?.role === 'staff' ? 'Set New Password' : 'Save new password'}</Button>
      <Button disabled={busy} onClick={logout}>Sign out</Button>
    </form>
  </div>
}
