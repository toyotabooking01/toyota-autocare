export function normalizedToyotaModel(value) {
  const model = String(value || '').trim().replace(/\s+/g, ' ').replace(/^toyota\s+/i, '').toLowerCase()
  const parents = {
    supra: 'gr supra', 'commuter deluxe': 'hiace', 'gl grandia': 'hiace',
    'gl grandia tourer': 'hiace', 'super grandia': 'hiace',
    'fortuner gr-s': 'fortuner', 'hilux fleet': 'hilux',
  }
  return parents[model] || model
}

export function catalogVariants(items, vehicle) {
  if (!vehicle?.model || !vehicle?.year || String(vehicle.make || 'Toyota').trim().toLowerCase() !== 'toyota') return []
  const model = normalizedToyotaModel(vehicle.model)
  const year = Number(vehicle.year)
  if (!Number.isInteger(year)) return []
  const seen = new Set()
  return items.filter(entry => {
    if (String(entry.make || '').trim().toLowerCase() !== 'toyota'
      || normalizedToyotaModel(entry.model) !== model || Number(entry.year) !== year
      || !String(entry.variant || '').trim()) return false
    const key = entry.variant.trim().toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).sort((a, b) => a.variant.localeCompare(b.variant))
}

export function catalogHasVariants(items, vehicle) {
  return catalogVariants(items, vehicle).length > 0
}

export function catalogVehicleImages(items, vehicle, models = []) {
  if (!vehicle?.model || !vehicle?.year || String(vehicle.make || 'Toyota').trim().toLowerCase() !== 'toyota') return []
  const model = normalizedToyotaModel(vehicle.model)
  if (models.length && !models.some(entry => normalizedToyotaModel(entry.model) === model)) return []
  const modelEntries = items.filter(entry => String(entry.make || '').trim().toLowerCase() === 'toyota'
    && normalizedToyotaModel(entry.model) === model)
  const yearEntries = modelEntries.filter(entry => Number(entry.year) === Number(vehicle.year))
  const variant = String(vehicle.variant || '').trim().toLowerCase()
  const exactEntries = variant ? yearEntries.filter(entry => String(entry.variant || '').trim().toLowerCase() === variant) : []
  const modelInfo = models.find(entry => normalizedToyotaModel(entry.model) === model)
  const urls = [
    // Verified transparent preview asset; catalog photos remain fallbacks.
    model === 'fortuner' ? '/toyota/fortuner-cutout.png' : undefined,
    ...exactEntries.map(entry => entry.imageUrl),
    ...yearEntries.map(entry => entry.imageUrl),
    ...yearEntries.map(entry => entry.generationImageUrl),
    modelInfo?.modelImageUrl || modelInfo?.imageUrl,
    ...modelEntries.map(entry => entry.modelImageUrl),
    // Older catalog rows may only have imageUrl. Treat one as a model fallback.
    ...modelEntries.sort((a, b) => Number(b.year) - Number(a.year)).map(entry => entry.imageUrl),
  ]
  return [...new Set(urls.map(url => url?.trim()).filter(Boolean))]
}

export function needsToyotaModelCorrection(items, vehicle, models = []) {
  if (!vehicle?.model || String(vehicle.make || '').trim().toLowerCase() !== 'toyota') return false
  if (models.length) return !models.some(entry => normalizedToyotaModel(entry.model) === normalizedToyotaModel(vehicle.model))
  return !items.some(entry => String(entry.make || '').trim().toLowerCase() === 'toyota'
      && normalizedToyotaModel(entry.model) === normalizedToyotaModel(vehicle.model))
}
