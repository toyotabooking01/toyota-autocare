export function scheduleBayNameCheck(request, params, onResult) {
  const controller = new AbortController()
  const timer = setTimeout(async () => {
    try {
      const response = await request('/service-bays/name-availability', { params, signal: controller.signal })
      if (!controller.signal.aborted) onResult(response.data.exists ? 'duplicate' : 'available')
    } catch {
      if (!controller.signal.aborted) onResult('unavailable')
    }
  }, 300)
  return () => { clearTimeout(timer); controller.abort() }
}
