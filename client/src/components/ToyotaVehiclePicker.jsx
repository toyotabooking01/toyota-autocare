import { useEffect, useState } from 'react'
import { Alert, Box, MenuItem, Stack, TextField, Typography } from '@mui/material'
import api from '../services/api'
import ToyotaVehicleImage from './ToyotaVehicleImage'
import { catalogVariants, catalogVehicleImages, normalizedToyotaModel } from '../utils/toyotaCatalog'

export default function ToyotaVehiclePicker({ value, onChange, validation, catalog, busy = false, size, legacy = false, children }) {
  const modelOptions = (catalog.models || []).filter(item => item.years?.length > 0)
  const models = modelOptions.map(item => item.model).sort()
  const modelKey = normalizedToyotaModel(value.model)
  const yearKey = `${modelKey}/${value.year || ''}`
  const [yearData, setYearData] = useState({ model: '', items: [], loading: false, error: '' })
  const [variantData, setVariantData] = useState({ key: '', items: [], loading: false, error: '' })
  useEffect(() => {
    if (legacy || !modelKey) return
    const controller = new AbortController()
    let active = true
    api.get('/toyota/years', { params: { model: modelKey }, signal: controller.signal })
      .then(({ data }) => {
        if (active) setYearData({ model: modelKey, items: data.items || [], loading: false, error: '' })
      })
      .catch(error => {
        if (active && error.code !== 'ERR_CANCELED') setYearData({ model: modelKey, items: [], loading: false,
          error: 'Verified years could not be loaded. Please try again.' })
      })
    return () => { active = false; controller.abort() }
  }, [legacy, modelKey])
  useEffect(() => {
    if (legacy || !modelKey || !value.year) return
    const controller = new AbortController()
    let active = true
    api.get('/toyota/variants', { params: { model: modelKey, year: value.year }, signal: controller.signal })
      .then(({ data }) => {
        if (active) setVariantData({ key: yearKey, items: data.items || [], loading: false, error: '' })
      })
      .catch(error => {
        if (active && error.code !== 'ERR_CANCELED') setVariantData({ key: yearKey, items: [], loading: false,
          error: 'Verified variants could not be loaded. Please try again.' })
      })
    return () => { active = false; controller.abort() }
  }, [legacy, modelKey, value.year, yearKey])
  const yearsLoading = Boolean(modelKey) && yearData.model !== modelKey
  const variantsLoading = Boolean(value.year) && variantData.key !== yearKey
  const years = yearData.model === modelKey ? yearData.items : []
  const variants = catalogVariants(variantData.key === yearKey ? variantData.items : [], value)
  const selected = variants.find(item => item.variant === value.variant)
  const unavailable = busy || catalog.loading || Boolean(catalog.error)
  const fieldProps = name => validation?.field(name) || {}
  const locked = { input: { readOnly: true } }

  return <Box className="vehicle-form-workspace" sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 2fr) minmax(0, 1fr)' }, gap: 3, alignItems: 'start', minWidth: 0 }}>
    <Stack spacing={2} sx={{ minWidth: 0 }}>
    {catalog.error && !legacy && <Alert severity="error">{catalog.error}</Alert>}
    {!legacy && yearData.model === modelKey && yearData.error && <Alert severity="error">{yearData.error}</Alert>}
    {!legacy && variantData.key === yearKey && variantData.error && <Alert severity="error">{variantData.error}</Alert>}
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
      <TextField name="make" label="Make" required fullWidth size={size} value={value.make || 'Toyota'}
        {...fieldProps('make')} slotProps={locked} />
      {legacy
        ? <TextField name="model" label="Model" required fullWidth size={size} value={value.model} slotProps={locked} />
        : <TextField select name="model" label="Model" required fullWidth size={size} value={value.model}
          {...fieldProps('model')} disabled={unavailable}
          onChange={event => onChange({ model: event.target.value, year: '', variant: '', transmission: '' })}>
          {models.map(model => <MenuItem key={model} value={model}>{model}</MenuItem>)}
        </TextField>}
    </Stack>
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
      {legacy
        ? <TextField name="year" label="Year" required fullWidth size={size} value={value.year} slotProps={locked} />
        : <TextField select name="year" label="Year" required fullWidth size={size} value={value.year}
          {...fieldProps('year')} disabled={unavailable || !value.model || yearsLoading || Boolean(yearData.error)}
          onChange={event => onChange({ year: event.target.value, variant: '', transmission: '' })}>
          {years.map(year => <MenuItem key={year} value={String(year)}>{year}</MenuItem>)}
        </TextField>}
      {legacy
        ? <TextField name="variant" label="Variant" fullWidth size={size} value={value.variant || 'Legacy vehicle'} slotProps={locked} />
        : <TextField select name="variant" label="Variant" required={variants.length > 0} fullWidth size={size} value={value.variant}
          {...fieldProps('variant')} disabled={unavailable || !value.year || variantsLoading || Boolean(variantData.error) || !variants.length}
          onChange={event => {
            const chosen = variants.find(item => item.variant === event.target.value)
            onChange({ variant: event.target.value, transmission: chosen?.transmission || '' })
          }}>
          {!variants.length && <MenuItem value="">{!value.year ? 'Select a year first'
            : variantsLoading ? 'Loading variants...' : 'No verified variant data available'}</MenuItem>}
          {variants.map(item => <MenuItem key={item._id || `${item.model}/${item.year}/${item.variant}`} value={item.variant}>{item.variant}</MenuItem>)}
        </TextField>}
    </Stack>
    {!legacy && value.year && variantData.key === yearKey && !variantsLoading && !variantData.error && !catalog.loading && !catalog.error && !variants.length
      && <Alert severity="info">No verified variant data is available for this model year. Select the transmission and continue without a variant.</Alert>}
    {(legacy || (value.year && !variants.length))
      ? <TextField select name="transmission" label="Transmission" required fullWidth size={size} value={value.transmission || ''}
        {...fieldProps('transmission')} disabled={busy || (!legacy && (unavailable || variantsLoading || Boolean(variantData.error)))}
        onChange={event => onChange({ transmission: event.target.value })}>
        {['manual', 'automatic', 'cvt'].map(option => <MenuItem key={option} value={option}>{option.toUpperCase()}</MenuItem>)}
      </TextField>
      : <TextField name="transmission" label="Transmission" required fullWidth size={size}
        value={(value.transmission || '').toUpperCase()} {...fieldProps('transmission')} slotProps={locked} />}
    {children}
    </Stack>
    <Box className="vehicle-form-preview" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0, p: 1.5, bgcolor: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: '16px' }}>
      <ToyotaVehicleImage sources={catalogVehicleImages(catalog.items, value, catalog.models)} vehicle={value}
        alt={`Toyota ${value.model || 'vehicle'}`} style={{ width: '100%', height: 'auto', maxHeight: 200, aspectRatio: '16 / 10', objectFit: 'contain', objectPosition: 'center', borderRadius: 12 }} />
      <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
        {selected ? `${selected.category} · ${selected.fuelType} · ${selected.seatingCapacity} seats` : 'The vehicle image updates when you choose a model and year.'}
      </Typography>
    </Box>
  </Box>
}
