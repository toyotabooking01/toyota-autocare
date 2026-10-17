import { useEffect, useState } from 'react'
import api from '../services/api'
import { validDate } from '../utils/validationRules.js'
import { DEFAULT_LIST_LIMIT, listSelection } from '../utils/listPagination.js'
import { friendlyError } from '../utils/friendlyErrors.js'

export const message = friendlyError

export default function useCatalog(endpoint, filters, paginated = false) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const { archive, search, status, availability, date, enabled, mechanic, customerType } = filters
  const key = JSON.stringify([endpoint, archive, search, status, availability, date, enabled, mechanic, customerType, paginated])
  const [selection, setSelection] = useState({ key, page: 1, limit: DEFAULT_LIST_LIMIT })
  const current = listSelection(selection, key)
  if (current !== selection) setSelection(current)
  const { page, limit } = current
  const [metadata, setMetadata] = useState(null)
  const [settledKey, setSettledKey] = useState(null)
  const requestKey = JSON.stringify([key, page, limit, revision])
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      setError('')
      if (date && !validDate(date)) { setLoading(false); return }
      try {
        const response = await api.get(endpoint, { params: { archive, search, status, availability, date, enabled, mechanic, customerType,
          ...(paginated ? { page, limit } : {}) }, signal: controller.signal })
        if (controller.signal.aborted) return
        if (paginated && response.data.page !== page) {
          setSelection({ key, page: response.data.page, limit }); return
        }
        setItems(response.data.items)
        setMetadata(response.data)
      } catch (requestError) {
        if (!controller.signal.aborted) { setError(message(requestError)); setItems([]); setMetadata(null) }
      } finally { if (!controller.signal.aborted) { setLoading(false); setSettledKey(requestKey) } }
    }, search ? 250 : 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [endpoint, archive, search, status, availability, date, enabled, mechanic, customerType, revision, paginated, page, limit, key, requestKey])
  const fieldErrors = date && !validDate(date) ? { date: 'Enter a valid calendar date.' } : {}
  const pending = paginated && !fieldErrors.date && settledKey !== requestKey
  const pagination = paginated ? { page, limit, totalItems: metadata?.totalItems || 0,
    totalPages: metadata?.totalPages || 0, busy: loading || pending,
    onPageChange: value => setSelection({ key, page: value, limit }),
    onLimitChange: value => setSelection({ key, page: 1, limit: value }) } : null
  return { items, loading: loading || pending, error, setError, fieldErrors, pagination, reload: () => setRevision(value => value + 1) }
}
