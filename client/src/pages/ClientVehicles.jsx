import { MoreActionsMenu, QuietDetailsButton } from '../components/RowActions'
import { MinimalStatus } from '../components/StatusChip'
import { useConfirmation } from '../components/ConfirmationContext'
import useFormValidation from '../components/useFormValidation'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Box, Button, CircularProgress, DialogActions, DialogContent, DialogTitle, InputAdornment, MenuItem, Stack, TextField, Typography } from '@mui/material'
import AddRounded from '@mui/icons-material/AddRounded'
import api from '../services/api'
import { PageHeading } from '../components/DashboardParts'
import useCatalog, { message } from './useCatalog'
import { normalizePlateInput } from '../../../shared/accountValidation.mjs'
import ToyotaVehiclePicker from '../components/ToyotaVehiclePicker'
import ToyotaVehicleImage from '../components/ToyotaVehicleImage'
import useToyotaCatalog from '../hooks/useToyotaCatalog'
import MileageInput from '../components/MileageInput'
import RecordList, { RecordPanel } from '../components/RecordList'
import { FormWorkspaceDialog } from '../components/FormWorkspace'
import { formWorkspaceGrid } from '../layouts/workspaceDimensions'
import { catalogVehicleImages, needsToyotaModelCorrection, normalizedToyotaModel } from '../utils/toyotaCatalog'
import { DetailDialog, DetailGrid, DetailInfo, DetailSection, DetailVehicle } from '../components/RecordDetails'
import { Search } from 'iconoir-react'

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
  const [search, setSearch] = useState('')
  const [order, setOrder] = useState('newest')
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
  const filteredItems = useMemo(() => items.filter(item => `${item.make} ${item.model} ${item.year} ${item.plateNumber}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => order === 'oldest' ? Number(a.year) - Number(b.year) : Number(b.year) - Number(a.year)), [items, search, order])
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
    <PageHeading title="My Vehicle" subtitle="Manage your Toyota vehicles." preview={false} />
    {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    <RecordPanel className="client-vehicle-workspace admin-list-surface">
      <Box className="admin-list-toolbar client-list-toolbar">
        <TextField className="client-list-search" size="small" placeholder="Search model, plate number, or year..." value={search} onChange={event => setSearch(event.target.value)} slotProps={{ htmlInput: { 'aria-label': 'Search model, plate number, or year' }, input: { startAdornment: <InputAdornment position="start"><Search width={17} height={17} strokeWidth={1.7} /></InputAdornment> } }} />
        <TextField select size="small" label="Vehicle status" value={archive} onChange={event => setArchive(event.target.value)}><MenuItem value="active">Current vehicles</MenuItem><MenuItem value="archived">Archived vehicles</MenuItem><MenuItem value="all">All vehicles</MenuItem></TextField>
        <TextField select size="small" label="Year order" value={order} onChange={event => setOrder(event.target.value)}><MenuItem value="newest">Newest first</MenuItem><MenuItem value="oldest">Oldest first</MenuItem></TextField>
        <Button className="client-list-add" variant="contained" startIcon={<AddRounded />} onClick={() => openForm()}>Add Vehicle</Button>
      </Box>
      <Box className="client-vehicle-header admin-list-header" aria-hidden="true"><span>Vehicle</span><span>Year</span><span>Plate Number</span><span>Transmission</span><span>Mileage</span><span>Status</span><span>Action</span></Box>
      <RecordList className="client-vehicle-list" items={filteredItems} selectionKey={`${archive}/${search}/${order}`}
        loading={loading && <Stack alignItems="center" sx={{ py: 6 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 1 }}>Loading vehicles…</Typography></Stack>}
        empty="No vehicles found.">
        {item => <Box component="article" key={item._id} className="client-vehicle-row admin-list-row">
          <Box className="client-vehicle-identity"><ToyotaVehicleImage sources={catalogVehicleImages(catalog.items, item, catalog.models)} vehicle={item} allowExternal={catalog.loading || catalog.error || !needsToyotaModelCorrection(catalog.items, item, catalog.models)} alt={`${item.make} ${item.model}`} /><span>{item.make} {item.model}</span></Box>
          <Typography>{item.year}</Typography><Typography>{item.plateNumber}</Typography><Typography>{item.transmission?.toUpperCase() || 'Not recorded'}</Typography><Typography>{Number(item.currentMileage).toLocaleString()} km</Typography>
          <MinimalStatus label={item.isArchived ? 'Archived' : 'Current'} status={item.isArchived ? 'archived' : 'active'} />
          <Box className="client-vehicle-actions"><QuietDetailsButton onClick={() => setSelected(item)} />{!item.isArchived && <MoreActionsMenu label={`${item.make} ${item.model} ${item.plateNumber}`} disabled={saving} items={[{ label: 'Edit', onClick: () => openForm(item) }]} />}</Box>
        </Box>}
      </RecordList>
    </RecordPanel>
    <DetailDialog className="client-vehicle-details-dialog" open={Boolean(selected)} onClose={() => setSelected(null)} title="Vehicle Details" reference={selected?.plateNumber}
      status={selected && <MinimalStatus label={selected.isArchived ? 'Archived' : 'Current'} status={selected.isArchived ? 'archived' : 'active'} />}
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
      <DialogTitle id="vehicle-form-title">{editing?._id ? 'Edit Vehicle' : 'Add Vehicle'}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        {formError && <Alert severity="error">{formError}</Alert>}
        <ToyotaVehiclePicker value={form} onChange={changes => setForm(current => ({ ...current, ...changes }))}
          validation={validation} catalog={catalog} busy={saving} legacy={readonlyIdentity}>
          <Box sx={formWorkspaceGrid}><TextField label="Plate number" required fullWidth value={form.plateNumber} {...validation.field('plateNumber')} slotProps={{ htmlInput: { maxLength: 8, style: { textTransform: 'uppercase' } } }} onBlur={() => change('plateNumber', normalizePlateInput(form.plateNumber, { trim: true }))} onChange={event => change('plateNumber', normalizePlateInput(event.target.value))} /><MileageInput value={form.currentMileage} onValueChange={value => change('currentMileage', value)} {...validation.field('currentMileage')} /></Box>
        </ToyotaVehiclePicker>
      </Stack></DialogContent><DialogActions sx={{ p: 2.5 }}><Button disabled={saving} onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={saving} variant="contained">{saving ? 'Saving…' : 'Save'}</Button></DialogActions>
    </Box></FormWorkspaceDialog>
  </>
}
