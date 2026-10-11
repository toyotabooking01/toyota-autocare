import { useState } from 'react'
import { validateClientForm, visibleRemoteErrors } from '../utils/formValidation'
import { friendlyFieldErrors } from '../utils/friendlyErrors'
import { schemas } from '../utils/validationRules'

export default function useFormValidation(kind, values, options = {}) {
  const [submitted, setSubmitted] = useState(false)
  const [remote, setRemote] = useState({})
  const [snapshot, setSnapshot] = useState({})
  const [nativeErrors, setNativeErrors] = useState({})
  const check = () => ({ ...validateClientForm(kind, values, options), ...nativeErrors })
  const local = check()
  const errors = submitted ? { ...local } : {}
  Object.assign(errors, visibleRemoteErrors(kind, values, remote, snapshot))
  return {
    errors,
    field: (key, hint) => ({ name: key, error: Boolean(errors[key]), helperText: errors[key] || hint,
      // Update alongside onChange in the bubble phase. A capture-phase state
      // update can restore the old controlled value before onChange reads it.
      onInput: event => {
        const badInput = event.target.validity?.badInput
        setNativeErrors(current => {
          if (Boolean(current[key]) === Boolean(badInput)) return current
          const next = { ...current }
          if (badInput) next[key] = 'Enter a complete, valid value.'
          else delete next[key]
          return next
        })
      },
    }),
    firstError: () => Object.keys(check())[0],
    validate: () => { setSubmitted(true); setRemote({}); return !Object.keys(check()).length },
    receive: error => { setRemote(friendlyFieldErrors(error.response?.data?.errors, [...Object.keys(schemas[kind]), ...Object.keys(values)])); setSnapshot({ ...values }) },
    reset: () => { setSubmitted(false); setRemote({}); setNativeErrors({}) },
  }
}
