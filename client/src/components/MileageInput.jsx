import { useLayoutEffect, useRef } from 'react'
import { InputAdornment, TextField } from '@mui/material'

const MAX_DIGITS = 7 // Matches the vehicle mileage validation limit: 9,999,999 km.

function formatMileage(value) {
  if (value === '' || value === null || value === undefined) return ''
  return Number(value).toLocaleString('en-US')
}

function cursorAfterDigits(text, count) {
  if (count === 0) return 0
  let seen = 0
  for (let index = 0; index < text.length; index += 1) {
    if (/\d/.test(text[index]) && ++seen === count) return index + 1
  }
  return text.length
}

export default function MileageInput({ value, onValueChange, label = 'Current mileage', optional = false,
  size, disabled = false, ...fieldProps }) {
  const inputRef = useRef(null)
  const pendingCursor = useRef(null)
  const display = formatMileage(value)

  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input || pendingCursor.current === null || document.activeElement !== input) return
    const position = cursorAfterDigits(display, pendingCursor.current)
    input.setSelectionRange(position, position)
    pendingCursor.current = null
  }, [display])

  function handleChange(event) {
    const input = event.target
    const before = input.value.slice(0, input.selectionStart ?? input.value.length)
    const digits = input.value.replace(/\D/g, '').slice(0, MAX_DIGITS)
    const next = digits === '' ? '' : Number(digits)
    const formatted = formatMileage(next)
    const digitPosition = Math.min(before.replace(/\D/g, '').length, String(next).length)
    pendingCursor.current = digitPosition
    // Clean invalid pasted/typed characters immediately, even when the numeric
    // value stays unchanged and React has no state update to render.
    input.value = formatted
    const position = cursorAfterDigits(formatted, digitPosition)
    input.setSelectionRange(position, position)
    onValueChange(next)
  }

  return <TextField name="currentMileage" label={label} type="text" required={!optional} size={size}
    fullWidth value={display} disabled={disabled} {...fieldProps} inputRef={inputRef}
    onChange={handleChange} slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 9,
      'aria-label': label }, input: { endAdornment: <InputAdornment position="end">km</InputAdornment> } }} />
}
