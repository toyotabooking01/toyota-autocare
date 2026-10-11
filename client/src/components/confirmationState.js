// One pending action at a time; No never invokes the action or resets its form.
export function createConfirmationController(onChange) {
  let pending = null
  let running = false
  return {
    request(options, action) {
      if (pending || running) return false
      pending = { ...(typeof options === 'string' ? { message: options } : options), action }
      onChange({ ...pending, action: undefined, busy: false })
      return true
    },
    cancel() {
      if (running) return
      pending = null
      onChange(null)
    },
    async approve() {
      if (!pending || running) return
      running = true
      const selected = pending
      onChange({ ...selected, action: undefined, busy: true })
      try {
        await selected.action()
        pending = null
        onChange(null)
      } catch {
        onChange({ ...selected, action: undefined, busy: false, error: 'The action could not be completed. Please try again.' })
      } finally { running = false }
    },
    dispose() { pending = null },
  }
}
