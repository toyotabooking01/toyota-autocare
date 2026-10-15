import { Box, MenuItem, Stack, TextField, Typography } from '@mui/material'
import ToyotaVehicleImage from './ToyotaVehicleImage'
import { catalogVehicleImages } from '../utils/toyotaCatalog'

const transmissions = { automatic: 'Automatic', manual: 'Manual', cvt: 'CVT' }

export default function ToyotaVehiclePicker({ value, onChange, validation, catalog, busy = false, size,
  legacy = false, children }) {
  const models = (catalog.models || []).filter(item => item.years?.length > 0)
    .map(item => item.model).sort()
  const unavailable = busy || catalog.loading || Boolean(catalog.error)
  const fieldProps = name => validation?.field(name) || {}
  const locked = { input: { readOnly: true } }

  return <Box className="vehicle-form-workspace" sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 2fr) minmax(0, 1fr)' }, gap: 3, alignItems: 'start', minWidth: 0 }}>
    <Stack spacing={2} sx={{ minWidth: 0 }}>
      {catalog.error && !legacy && <Typography color="error" role="alert">{catalog.error}</Typography>}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <TextField name="make" label="Make" required fullWidth size={size} value="Toyota"
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
        <TextField name="year" label="Year" type="text" required fullWidth size={size} value={value.year || ''}
          {...fieldProps('year')} disabled={busy || (!legacy && (!value.model || unavailable))}
          slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 4, readOnly: legacy } }}
          onChange={event => onChange({ year: event.target.value, variant: '', transmission: '' })} />
        <TextField name="variant" label="Variant" required={!legacy} fullWidth size={size} value={value.variant || ''}
          {...fieldProps('variant')} disabled={busy || (!legacy && !value.year)}
          slotProps={{ htmlInput: { maxLength: 120 } }}
          onChange={event => onChange({ variant: event.target.value })}
          onBlur={() => onChange({ variant: String(value.variant || '').trim() })} />
      </Stack>
      <TextField select name="transmission" label="Transmission" required fullWidth size={size} value={value.transmission || ''}
        {...fieldProps('transmission')} disabled={busy || (!legacy && !value.year)}
        onChange={event => onChange({ transmission: event.target.value })}>
        {Object.entries(transmissions).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}
      </TextField>
      {children}
    </Stack>
    <Box className="vehicle-form-preview" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0, p: 1.5, bgcolor: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: '16px' }}>
      <ToyotaVehicleImage key={`${value.model}|${value.year}`} sources={catalogVehicleImages(catalog.items, value, catalog.models)} vehicle={value}
        alt={`Toyota ${value.model || 'vehicle'}`} style={{ width: '100%', height: 'auto', maxHeight: 200, aspectRatio: '16 / 10', objectFit: 'contain', objectPosition: 'center', borderRadius: 12 }} />
      <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
        The image uses the closest available model and year photo.
      </Typography>
    </Box>
  </Box>
}
