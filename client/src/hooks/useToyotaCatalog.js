import { useEffect, useState } from 'react'
import api from '../services/api'

export default function useToyotaCatalog() {
  const [items, setItems] = useState([])
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    api.get('/toyota/catalog', { signal: controller.signal }).then(({ data }) => {
      setItems(data.items || []); setModels(data.models || []); setLoading(false)
    }).catch(requestError => {
      if (requestError.code !== 'ERR_CANCELED') {
        setError('Toyota vehicle catalog is unavailable. Please try again later.'); setLoading(false)
      }
    })
    return () => controller.abort()
  }, [])
  return { items, models, loading, error }
}
