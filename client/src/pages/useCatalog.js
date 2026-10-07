import { useEffect, useState } from 'react'
import api from '../services/api'

export function message(error) { return error.response?.data?.message || 'Request failed. Please try again.' }

export default function useCatalog(endpoint, filters) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const { archive, search, status, availability, date, enabled } = filters
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        const response = await api.get(endpoint, { params: { archive, search, status, availability, date, enabled }, signal: controller.signal })
        setItems(response.data.items)
      } catch (requestError) {
        if (!controller.signal.aborted) { setError(message(requestError)); setItems([]) }
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }, search ? 250 : 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [endpoint, archive, search, status, availability, date, enabled, revision])
  return { items, loading, error, setError, reload: () => setRevision(value => value + 1) }
}
