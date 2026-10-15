import { useEffect, useState } from 'react'
import api from '../services/api'
import emergencyPlaceholder from '../assets/toyota-vehicle-placeholder.svg'

const placeholder = '/images/toyota-placeholder.png'

export default function ToyotaVehicleImage({ sources = [], vehicle, allowExternal = true, alt = 'Toyota vehicle', ...props }) {
  const [failedSources, setFailedSources] = useState([])
  const [placeholderFailed, setPlaceholderFailed] = useState(false)
  const [external, setExternal] = useState({ key: '', imageUrl: '' })
  const catalogSource = sources.find(source => source && !failedSources.includes(source))
  const lookupKey = allowExternal && !catalogSource && vehicle?.model && vehicle?.year
    && String(vehicle.make || 'Toyota').trim().toLowerCase() === 'toyota'
    ? `${vehicle.make || 'Toyota'}|${vehicle.model}|${vehicle.year}` : ''
  useEffect(() => {
    if (!lookupKey) return
    const controller = new AbortController()
    api.get('/toyota/external-image', { params: { model: vehicle.model, year: vehicle.year }, signal: controller.signal })
      .then(({ data }) => setExternal({ key: lookupKey, imageUrl: data.imageUrl || '' }))
      .catch(() => setExternal({ key: lookupKey, imageUrl: '' }))
    return () => controller.abort()
  }, [lookupKey, vehicle?.model, vehicle?.year])
  const externalSource = external.key === lookupKey && !failedSources.includes(external.imageUrl) ? external.imageUrl : ''
  const displaySrc = catalogSource || externalSource || (placeholderFailed ? emergencyPlaceholder : placeholder)
  return <img src={displaySrc} alt={alt}
    onError={() => {
      if (displaySrc === placeholder) setPlaceholderFailed(true)
      else if (displaySrc !== emergencyPlaceholder) setFailedSources(current => [...current, displaySrc])
    }} {...props} />
}
