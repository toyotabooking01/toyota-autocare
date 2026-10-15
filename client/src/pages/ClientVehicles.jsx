import { DetailsButton, MoreActionsMenu } from '../components/RowActions'
import { StatusBadge } from '../components/StatusChip'
import { useConfirmation } from '../components/ConfirmationContext'
import useFormValidation from '../components/useFormValidation'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Box, Button, CircularProgress, DialogActions, DialogContent, DialogTitle, MenuItem, Select, Stack, TextField, Typography } from '@mui/material'
import AddRounded from '@mui/icons-material/AddRounded'
import api from '../services/api'
import { PageHeading } from '../components/DashboardParts'
import useCatalog, { message } from './useCatalog'
import { normalizePlateInput } from '../../../shared/accountValidation.mjs'
import ToyotaVehiclePicker from '../components/ToyotaVehiclePicker'
import ToyotaVehicleImage from '../components/ToyotaVehicleImage'
import useToyotaCatalog from '../hooks/useToyotaCatalog'
import MileageInput from '../components/MileageInput'
import RecordList, { RecordCard, RecordActions, RecordPanel } from '../components/RecordList'
import { FormWorkspaceDialog } from '../components/FormWorkspace'
import { formWorkspaceGrid } from '../layouts/workspaceDimensions'
import { catalogVehicleImages, needsToyotaModelCorrection, normalizedToyotaModel } from '../utils/toyotaCatalog'
import { DetailDialog, DetailGrid, DetailInfo, DetailSection, DetailVehicle } from '../components/RecordDetails'

const empty = { make: 'Toyota', model: '', year: '', variant: '', plateNumber: '', transmission: '', currentMileage: '' }

export default function ClientVehicles() {
  const [selected, setSelected] = useState(null)
  const [vehicleHistory, setVehicleHistory] = useState({ vehicleId: null, items: [] })
  useEffect(() => {
    if (!selected?._id) return undefined
    const controller = new AbortController()
    api.get('/service-history', { params: { vehicle: selected._id }, signal: controller.signal })
      .then(response => setVehicleHistory({ vehicleId: selected._id, items: response.data.items || [] }))
      .catch(() => { if (!controller.signal.aborted) setVehicleHistory({ vehicleId: selected._id, items: [] }) })
    return () => controller.abort()
  }, [selected?._id])
  const confirm = useConfirmation()
  const [archive, setArchive] = useState('active')
  const { items, loading, error, setError, reload } = useCatalog('/vehicles', { archive })
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [formError, setFormError] = useState('')
  const catalog = useToyotaCatalog()
  const legacy = Boolean(editing?._id && !editing.variant && !form.variant.trim())
  const readonlyIdentity = Boolean(editing?._id && !catalog.loading && !catalog.models.some(item =>
    normalizedToyotaModel(item.model) === normalizedToyotaModel(editing.model)))
  const validation = useFormValidation('clientVehicle', form,
    { skip: legacy ? ['variant'] : [], existingPlate: editing?._id ? editing.plateNumber : undefined })
  const [saving, setSaving] = useState(false)
  function openForm(item = {}) {
    validation.reset()
    setEditing(item)
    setForm(item._id ? { make: item.make, model: item.model, year: String(item.year), variant: item.variant || '', plateNumber: item.plateNumber, transmission: item.transmission, currentMileage: item.currentMileage ?? 0 } : { ...empty })
    setFormError('')
  }
  function change(key, value) { setForm(current => ({ ...current, [key]: value })); setFormError('') }
  async function save(event) {
    event.preventDefault()
    if (saving || !validation.validate()) return
    return confirm(editing?._id ? 'Are you sure you want to save these changes?' : 'Are you sure you want to add this vehicle?', async () => {
      setSaving(true)
      try {
        const data = { make: form.make.trim(), model: form.model.trim(), year: Number(form.year),
          ...(legacy ? {} : { variant: form.variant.trim() }), plateNumber: normalizePlateInput(form.plateNumber, { trim: true }),
          transmission: form.transmission, currentMileage: form.currentMileage }
        if (editing?._id) await api.patch(`/vehicles/${editing._id}`, data)
        else await api.post('/vehicles', data)
        setEditing(null); setNotice(`Vehicle ${editing?._id ? 'updated' : 'added'} successfully.`); reload()
      } catch (requestError) { validation.receive(requestError); setFormError(requestError.response?.data?.errors ? '' : message(requestError)) }
      finally { setSaving(false) }
    })
  }
  return <>
    <PageHeading title="My vehicles" subtitle="Keep your Toyota vehicle details up to date." preview={false} />
    {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    <RecordPanel>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1.5} sx={{ mb: 2.5 }}>
        <Select variant="standard" disableUnderline value={archive} onChange={event => setArchive(event.target.value)}
          inputProps={{ 'aria-label': 'Registered vehicle records filter' }}
          sx={theme => ({ width: 190, maxWidth: '100%', height: 38, borderRadius: '8px', fontSize: 13,
            color: theme.palette.mode === 'dark' ? '#f8fafc' : '#111827',
            backgroundColor: theme.palette.mode === 'dark' ? '#1d2833' : '#ffffff',
            border: `1px solid ${theme.palette.mode === 'dark' ? '#344452' : '#dde3e8'}`,
            '&:hover': { backgroundColor: theme.palette.mode === 'dark' ? '#263442' : '#f6f8fa' },
            '& .MuiSelect-select': { boxSizing: 'border-box', height: '100%', display: 'flex', alignItems: 'center',
              padding: '0 30px 0 12px !important' },
            '& .MuiSelect-icon': { color: 'inherit', right: 7 },
            '&.Mui-focused': { outline: '2px solid', outlineColor: theme.palette.mode === 'dark' ? '#9eadba' : '#52606d', outlineOffset: 2 },
          })}
          MenuProps={{ PaperProps: { sx: theme => ({ mt: 0.5, minWidth: 190, borderRadius: '8px',
            backgroundColor: theme.palette.mode === 'dark' ? '#18232d' : '#ffffff',
            border: `1px solid ${theme.palette.mode === 'dark' ? '#344452' : '#dde3e8'}`,
            '& .MuiMenuItem-root': { fontSize: 13, minHeight: 36,
              '&:hover': { backgroundColor: theme.palette.mode === 'dark' ? '#263442' : '#e9eef2' },
              '&.Mui-selected, &.Mui-selected:hover': { backgroundColor: theme.palette.mode === 'dark' ? '#33414e' : '#e9eef2' },
            },
          }) } }}>
          <MenuItem value="active">Current vehicles</MenuItem>
          <MenuItem value="archived">Archived vehicles</MenuItem>
          <MenuItem value="all">All registered vehicles</MenuItem>
        </Select>
        <Button variant="contained" startIcon={<AddRounded />} onClick={() => openForm()}>Add vehicle</Button>
      </Stack>
      <RecordList items={items} selectionKey={archive}
        loading={loading && <Stack alignItems="center" sx={{ py: 6 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 1 }}>Loading vehicles…</Typography></Stack>}
        empty="No vehicles in this view.">
        {item => <RecordCard key={item._id} sx={{ bgcolor: item.isArchived ? 'var(--surface-soft)' : 'var(--surface)' }}
          avatar={<ToyotaVehicleImage sources={catalogVehicleImages(catalog.items, item, catalog.models)} vehicle={item} allowExternal={catalog.loading || catalog.error || !needsToyotaModelCorrection(catalog.items, item, catalog.models)} alt={`${item.make} ${item.model}`} />}>
          <Box className="record-card-copy"><Typography sx={{ fontSize: 14, fontWeight: 650 }}>{item.make} {item.model}</Typography><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{item.year} · {item.variant || 'Variant not recorded'} · {item.plateNumber}</Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{item.transmission.toUpperCase()} · {Number(item.currentMileage).toLocaleString()} km</Typography>
          </Box><RecordActions statuses={<>{!catalog.loading && !catalog.error && needsToyotaModelCorrection(catalog.items, item, catalog.models) && <StatusBadge color="warning" label="Model needs correction" />}<StatusBadge label={item.isArchived ? 'Archived' : 'Current'} sx={{ bgcolor: item.isArchived ? 'var(--surface-soft)' : 'var(--green-soft)' }} /></>}>
            <DetailsButton onClick={() => setSelected(item)}>Details</DetailsButton>
            {!item.isArchived && <MoreActionsMenu label={`${item.make} ${item.model} ${item.plateNumber}`} disabled={saving} items={[{ label: 'Edit', onClick: () => openForm(item) }]} />}
          </RecordActions>
        </RecordCard>}
      </RecordList>
    </RecordPanel>
    <DetailDialog open={Boolean(selected)} onClose={() => setSelected(null)} title="Vehicle details" reference={selected?.plateNumber}
      status={selected && <StatusBadge size="small" label={selected.isArchived ? 'Archived' : 'Current'} sx={{ bgcolor: selected.isArchived ? 'var(--surface-soft)' : 'var(--green-soft)' }} />}
      actions={selected && !selected.isArchived && <Button variant="contained" onClick={() => { openForm(selected); setSelected(null) }}>Edit</Button>}>
      {selected && <DetailGrid>
        <DetailSection title="Vehicle"><DetailVehicle vehicle={selected} /></DetailSection>
        <DetailSection title="Vehicle information"><DetailInfo items={[["Variant", selected.variant || 'Variant not recorded'], ["Current mileage", `${Number(selected.currentMileage).toLocaleString()} km`], ["Transmission", selected.transmission?.toUpperCase()], ["Model year", selected.year]]} /></DetailSection>
        <DetailSection title="Service History">
          {vehicleHistory.vehicleId === selected._id && vehicleHistory.items.length ? vehicleHistory.items.map(record => <Typography key={record._id} sx={{ fontSize: 13, py: .5 }}>
            {new Date(record.completedAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })} · {[...record.originalServices, ...record.additionalWork].map(item => item.name).join(', ') || 'Service details unavailable'}
          </Typography>) : <Typography sx={{ fontSize: 13 }}>No completed services yet.</Typography>}
          <Button size="small" component={Link} to={`/client/service-history?vehicle=${selected._id}`}>View full history</Button>
        </DetailSection>
      </DetailGrid>}
    </DetailDialog>
    <FormWorkspaceDialog open={editing !== null} onClose={() => { if (!saving) setEditing(null) }} aria-labelledby="vehicle-form-title"><Box component="form" noValidate onSubmit={save}>
      <DialogTitle id="vehicle-form-title">{editing?._id ? 'Edit vehicle' : 'Add vehicle'}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        {formError && <Alert severity="error">{formError}</Alert>}
        <ToyotaVehiclePicker value={form} onChange={changes => setForm(current => ({ ...current, ...changes }))}
          validation={validation} catalog={catalog} busy={saving} legacy={readonlyIdentity}>
          <Box sx={formWorkspaceGrid}><TextField label="Plate number" required fullWidth value={form.plateNumber} {...validation.field('plateNumber')} slotProps={{ htmlInput: { maxLength: 8, style: { textTransform: 'uppercase' } } }} onBlur={() => change('plateNumber', normalizePlateInput(form.plateNumber, { trim: true }))} onChange={event => change('plateNumber', normalizePlateInput(event.target.value))} /><MileageInput value={form.currentMileage} onValueChange={value => change('currentMileage', value)} {...validation.field('currentMileage')} /></Box>
        </ToyotaVehiclePicker>
      </Stack></DialogContent><DialogActions sx={{ p: 2.5 }}><Button disabled={saving} onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={saving} variant="contained">{saving ? 'Saving…' : 'Save'}</Button></DialogActions>
    </Box></FormWorkspaceDialog>
  </>
}
