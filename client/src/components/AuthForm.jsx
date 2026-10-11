import { useId, useRef, useState } from 'react'
import { Button, FormHelperText, IconButton, InputAdornment, TextField } from '@mui/material'
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined'
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined'
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded'
import CheckRounded from '@mui/icons-material/CheckRounded'
import { Link } from 'react-router-dom'

export function Field({ label, type = 'text', slotProps = {}, ...props }) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  const isPassword = type === 'password'
  return <div className="field"><label htmlFor={id}>{label}</label>
    <TextField id={id} fullWidth required type={isPassword && visible ? 'text' : type} {...props}
      slotProps={{ ...slotProps, input: isPassword ? { endAdornment: <InputAdornment position="end"><IconButton size="small" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(!visible)}><>{visible ? <VisibilityOffOutlined fontSize="small" /> : <VisibilityOutlined fontSize="small" />}</></IconButton></InputAdornment> } : slotProps.input }} />
  </div>
}
export function Submit({ busy, children }) {
  return <Button type="submit" variant="contained" fullWidth disabled={busy} endIcon={!busy && <ArrowForwardRounded />}>{busy ? 'Please wait…' : children}</Button>
}
export function Steps({ active = 0 }) {
  return <ol className="steps">{['Create account', 'Verify email', 'Complete'].map((label, i) =>
    <li key={label} className={i <= active ? 'active' : ''} aria-current={i === active ? 'step' : undefined}><span>{i < active ? <CheckRounded sx={{ fontSize: 15 }} /> : i + 1}</span>{label}</li>)}</ol>
}
export function Success({ title, text }) {
  return <div className="success-panel" role="status"><span className="success-icon"><CheckRounded sx={{ fontSize: 42 }} /></span>
    <h2>{title}</h2><p>{text}</p><Button component={Link} to="/login" variant="contained" fullWidth endIcon={<ArrowForwardRounded />}>Back to sign in</Button></div>
}
export function OtpInput({ value, onChange, disabled, error }) {
  const refs = useRef([])
  function update(index, text) {
    const digits = text.replace(/\D/g, '').slice(0, 6)
    const next = Array.from({ length: 6 }, (_, i) => value[i] || '')
    if (!digits) next[index] = ''
    else for (let offset = 0; offset < digits.length && index + offset < 6; offset++) next[index + offset] = digits[offset]
    onChange(next)
    if (digits) refs.current[Math.min(index + digits.length, 5)]?.focus()
  }
  return <><div className="otp-inputs" role="group" aria-label="Six-digit verification code">{Array.from({ length: 6 }, (_, i) =>
    <input key={i} ref={node => { refs.current[i] = node }} aria-label={`Digit ${i + 1}`} inputMode="numeric"
      autoComplete={i === 0 ? 'one-time-code' : 'off'} value={value[i] || ''} disabled={disabled} required aria-invalid={Boolean(error)}
      onChange={event => update(i, event.target.value)}
      onFocus={event => event.target.select()}
      onPaste={event => { event.preventDefault(); update(i, event.clipboardData.getData('text')) }}
      onKeyDown={event => {
        if (event.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus()
        if (event.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
        if (event.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus()
      }} />)}</div>{error && <FormHelperText error>{error}</FormHelperText>}</>
}
