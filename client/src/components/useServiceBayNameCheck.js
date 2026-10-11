import { useEffect, useState } from 'react'
import api from '../services/api'
import { normalizeServiceBayName, SERVICE_BAY_DUPLICATE } from '../../../shared/serviceBayName.mjs'
import { scheduleBayNameCheck } from '../utils/serviceBayAvailability'

export default function useServiceBayNameCheck({ enabled, value, excludeId, revision }) {
  const name = normalizeServiceBayName(value || '')
  const eligible = enabled && name.length > 0 && name.length <= 80
  const key = JSON.stringify([name, excludeId, revision])
  const [result, setResult] = useState(null)
  useEffect(() => {
    if (!eligible) return undefined
    return scheduleBayNameCheck((...args) => api.get(...args), { name, ...(excludeId ? { excludeId } : {}) },
      status => setResult({ key, status }))
  }, [eligible, name, excludeId, key])
  const status = !eligible ? 'idle' : result?.key === key ? result.status : 'checking'
  return {
    blocked: status === 'checking' || status === 'duplicate',
    duplicate: status === 'duplicate',
    message: status === 'duplicate' ? SERVICE_BAY_DUPLICATE : status === 'checking' ? 'Checking Service Bay name…'
      : status === 'unavailable' ? 'Name check unavailable. We will check again when you save.' : undefined,
  }
}
