import { DetailsButton, MoreActionsMenu } from '../components/RowActions'
import ConfirmationDialog from '../components/ConfirmationDialog'
import { useConfirmation } from '../components/ConfirmationContext'
import useFormValidation from '../components/useFormValidation'
import useServiceBayNameCheck from '../components/useServiceBayNameCheck'
import { SERVICE_BAY_DUPLICATE } from '../../../shared/serviceBayName.mjs'
import { useState } from 'react'
import useCatalog, { message as errorMessage } from './useCatalog'
import RecordList, { RecordPanel } from '../components/RecordList'
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material'
import { Garage, Plus, Xmark } from 'iconoir-react'
import api from '../services/api'
import { PageHeading } from '../components/DashboardParts'
import { DetailDialog, DetailInfo, DetailSection } from '../components/RecordDetails'
import ServiceDirectoryRow, { ServiceDirectoryHeader } from '../components/ServiceDirectoryRow'
import { MinimalStatus } from '../components/StatusChip'
import { Link } from 'react-router-dom'
import { statusStyles } from '../app/statuses'

const definitions = {
  service: {
    title: 'Services', singular: 'service', endpoint: '/services',
    empty: { name: '', description: '', type: '', estimatedDuration: '', estimatedPrice: '', maintenanceReminderInterval: '', maintenanceIntervalKm: '', isActive: true, isOtherService: false, checklistTemplate: [] },
  },
  bay: {
    title: 'Service Bays', singular: 'bay', endpoint: '/service-bays',
    empty: { name: '', operationalStatus: 'operational' },
  },
}
const bayStatuses = [
  { value: 'operational', label: 'Operational' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'out_of_service', label: 'Out of service' },
]
const bayStatusLabel = value => value?.replaceAll('_', ' ').replace(/^\w/, letter => letter.toUpperCase()) || 'Unknown'
function payload(kind, form) {
  if (kind === 'bay') return { name: form.name.trim(), operationalStatus: form.operationalStatus }
  return {
    name: form.name.trim(), description: form.description.trim(), type: form.type,
    estimatedDuration: Number(form.estimatedDuration), estimatedPrice: Number(form.estimatedPrice),
    maintenanceReminderInterval: form.maintenanceReminderInterval === '' ? null : Number(form.maintenanceReminderInterval),
    maintenanceIntervalKm: form.maintenanceIntervalKm === '' ? null : Number(form.maintenanceIntervalKm),
    isActive: form.isActive,
    checklistTemplate: form.checklistTemplate,
  }
}


export default function AdminMasterData({ kind }) {
  const confirm = useConfirmation()
  const definition = definitions[kind]
  const [search, setSearch] = useState('')
  const [archive, setArchive] = useState('active')
  const [status, setStatus] = useState('all')
  const { items, loading, error, setError, reload, pagination } = useCatalog(definition.endpoint, { archive, status, search }, true)
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState(null)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(definition.empty)
  const [formError, setFormError] = useState('')
  const [checklistError, setChecklistError] = useState('')
  const [checklistDraft, setChecklistDraft] = useState('')
  const validation = useFormValidation(kind, form)
  const [saving, setSaving] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState(null)
  const [bayCheckRevision, setBayCheckRevision] = useState(0)
  const bayNameCheck = useServiceBayNameCheck({ enabled: kind === 'bay' && editing !== null,
    value: form.name, excludeId: editing?._id, revision: bayCheckRevision })

  function openForm(item = null) {
    setBayCheckRevision(value => value + 1)
    validation.reset()
    setEditing(item)
    setForm(item?._id ? kind === 'service' ? {
      name: item.name, description: item.description || '', estimatedDuration: String(item.estimatedDuration),
      estimatedPrice: String(item.estimatedPrice), maintenanceReminderInterval: item.maintenanceReminderInterval == null ? '' : String(item.maintenanceReminderInterval), maintenanceIntervalKm: item.maintenanceIntervalKm == null ? '' : String(item.maintenanceIntervalKm), isActive: item.isActive,
      type: item.type || '', isOtherService: item.isOtherService === true,
      checklistTemplate: item.checklistTemplate?.length ? [...item.checklistTemplate] : [],
    } : { name: item.name, operationalStatus: item.operationalStatus } : { ...definition.empty, checklistTemplate: [...(definition.empty.checklistTemplate || [])] })
    setFormError('')
    setChecklistError('')
    setChecklistDraft('')
  }
  function change(key, value) { setForm(current => ({ ...current, [key]: value })); setFormError('') }
  function addChecklistItem() {
    const item = checklistDraft.trim()
    const current = form.checklistTemplate || []
    if (!item) return
    if (current.length >= 10) { setChecklistError('A Service can have up to 10 checklist items.'); return }
    if (current.some(value => value.trim().toLocaleLowerCase() === item.toLocaleLowerCase())) { setChecklistError('Remove duplicate checklist items.'); return }
    change('checklistTemplate', [...current, item]); setChecklistDraft(''); setChecklistError('')
  }
  async function save(event) {
    event.preventDefault()
    if (saving || !validation.validate() || (kind === 'bay' && bayNameCheck.blocked)) return
    let formToSave = form
    if (kind === 'service') {
      const checklistItems = (form.checklistTemplate || []).map(item => item.trim())
      if (checklistItems.length > 10) { setChecklistError('A Service can have up to 10 checklist items.'); return }
      if (checklistItems.some(item => !item)) { setChecklistError('Fill in each item or remove the blank field.'); return }
      if (new Set(checklistItems.map(item => item.toLocaleLowerCase())).size !== checklistItems.length) {
        setChecklistError('Remove duplicate checklist items.'); return
      }
      setChecklistError('')
      formToSave = { ...form, checklistTemplate: checklistItems }
    }
    return confirm(editing?._id ? 'Are you sure you want to save these changes?' : 'Are you sure you want to submit this information?', async () => {
      setSaving(true)
      setFormError('')
      try {
        if (editing?._id) await api.patch(`${definition.endpoint}/${editing._id}`, payload(kind, formToSave))
        else await api.post(definition.endpoint, payload(kind, formToSave))
        setNotice(`${definition.singular === 'bay' ? 'Bay' : 'Service'} ${editing?._id ? 'updated' : 'created'} successfully.`)
        setEditing(null)
        reload()
      } catch (requestError) {
        if (kind === 'bay' && requestError.response?.status === 409 && requestError.response?.data?.errors?.name) {
          validation.receive({ response: { data: { errors: { name: SERVICE_BAY_DUPLICATE } } } })
          setBayCheckRevision(value => value + 1)
        } else { validation.receive(requestError); setFormError(requestError.response?.data?.errors ? '' : errorMessage(requestError)) }
      }
      finally { setSaving(false) }
    })
  }
  async function toggleArchive() {
    if (saving || !archiveTarget) return
    const target = archiveTarget
    if (!target) return
    setSaving(true)
    try {
      await api.post(`${definition.endpoint}/${target._id}/${target.isArchived ? 'restore' : 'archive'}`)
      setNotice(`${target.name} ${target.isArchived ? 'restored' : 'archived'}.`)
      setArchiveTarget(null)
      reload()
    } catch (requestError) { setError(errorMessage(requestError)); setArchiveTarget(null) }
    finally { setSaving(false) }
  }
  const formOpen = editing !== null
  return <>
    <PageHeading title={definition.title} subtitle={`Manage your Toyota AutoCare ${definition.title.toLowerCase()} catalog.`} preview={false} />
    {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    <RecordPanel className={`${kind === 'service' ? 'service-directory-panel' : 'bay-directory-panel'} admin-list-surface`}>
      {kind === 'service' ? <Box className="service-directory-toolbar admin-list-toolbar">
        <TextField className="service-directory-search" label="Search services by name" size="small" value={search} slotProps={{ htmlInput: { maxLength: 100 } }} onChange={event => setSearch(event.target.value)} />
        <TextField select label="Records" size="small" value={archive} onChange={event => setArchive(event.target.value)}><MenuItem value="active">Current</MenuItem><MenuItem value="archived">Archived</MenuItem><MenuItem value="all">All</MenuItem></TextField>
        <TextField select label="Status" size="small" value={status} onChange={event => setStatus(event.target.value)}><MenuItem value="all">All statuses</MenuItem><MenuItem value="active">Active</MenuItem><MenuItem value="inactive">Inactive</MenuItem></TextField>
        <Button className="service-directory-add" variant="contained" startIcon={<Plus width={16} height={16} strokeWidth={1.8} />} onClick={() => openForm({})}>Add Services</Button>
      </Box> : <Box className="bay-directory-toolbar admin-list-toolbar">
        <TextField className="bay-directory-search" label="Search by name" size="small" value={search} slotProps={{ htmlInput: { maxLength: 100 } }} onChange={event => setSearch(event.target.value)} />
        <TextField select label="Records" size="small" value={archive} onChange={event => setArchive(event.target.value)}><MenuItem value="active">Current</MenuItem><MenuItem value="archived">Archived</MenuItem><MenuItem value="all">All</MenuItem></TextField>
        <TextField select label="Status" size="small" value={status} onChange={event => setStatus(event.target.value)}><MenuItem value="all">All statuses</MenuItem>{bayStatuses.map(option => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</TextField>
        <Button className="bay-directory-add" variant="contained" startIcon={<Plus width={16} height={16} strokeWidth={1.8} />} onClick={() => openForm({})}>Add Bay</Button>
      </Box>}
      {kind === 'service' ? <ServiceDirectoryHeader /> : <Box className="bay-directory-header admin-list-header" aria-hidden="true"><span>Service Bay</span><span>Operational status</span><span>Availability</span><span>Details</span><span>More</span></Box>}
      <RecordList className={kind === 'service' ? 'service-directory-list' : 'bay-directory-list'} items={items} pagination={pagination} loading={loading && <Stack alignItems="center" sx={{ py: 6 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 2, fontSize: 13 }}>Loading {definition.title.toLowerCase()}…</Typography></Stack>} empty={`No ${definition.title.toLowerCase()} match these filters.`}>
        {item => kind === 'service' ? <ServiceDirectoryRow key={item._id} service={item} onDetails={() => setSelected(item)} onEdit={() => openForm(item)} onArchive={() => setArchiveTarget(item)} disabled={saving} />
          : <Box key={item._id} className="bay-directory-row admin-list-row">
            <Box className="bay-directory-identity"><span className="bay-directory-icon" aria-hidden="true"><Garage width={19} height={19} strokeWidth={1.7} /></span><Typography title={item.name}>{item.name}</Typography></Box>
            <MinimalStatus label={item.isArchived ? 'Archived' : bayStatusLabel(item.operationalStatus)} status={item.isArchived ? 'archived' : item.operationalStatus === 'operational' ? 'operational' : item.operationalStatus === 'maintenance' ? 'busy' : 'inactive'} />
            <MinimalStatus label={bayStatusLabel(item.availability)} status={item.availability === 'available' ? 'available' : item.availability === 'occupied' ? 'occupied' : 'unknown'} />
            <DetailsButton className="bay-directory-details admin-list-details" onClick={() => setSelected(item)}>Details</DetailsButton>
            <Box className="bay-directory-more"><MoreActionsMenu label={item.name} disabled={saving} items={[!item.isArchived && { label: 'Edit Bay', onClick: () => openForm(item) }, { label: item.isArchived ? 'Restore' : 'Archive', onClick: () => setArchiveTarget(item) }]} /></Box>
          </Box>}
      </RecordList>
    </RecordPanel>
    <DetailDialog className={kind === 'service' ? 'service-details-dialog' : 'bay-details-dialog'}
      paperSx={kind === 'service' ? { width: 'min(760px, calc(100vw - 32px))', maxWidth: 760, borderRadius: '14px' } : undefined}
      open={Boolean(selected)} onClose={() => setSelected(null)} title={kind === 'service' ? 'Service details' : 'Bay Details'} reference={selected?.name}
      status={selected && (kind === 'service'
        ? <MinimalStatus label={selected.isArchived ? 'Archived' : selected.isActive ? 'Active' : 'Inactive'} status={selected.isArchived ? 'archived' : selected.isActive ? 'active' : 'inactive'} />
        : <MinimalStatus label={selected.isArchived ? 'Archived' : bayStatusLabel(selected.operationalStatus)} status={selected.isArchived ? 'archived' : selected.operationalStatus === 'operational' ? 'operational' : selected.operationalStatus === 'maintenance' ? 'busy' : 'inactive'} />)}
      actions={selected && kind === 'service' && !selected.isArchived && <Button variant="contained" onClick={() => { openForm(selected); setSelected(null) }}>Edit</Button>}>
      {selected && <>
        <DetailSection title={kind === 'service' ? 'Service overview' : 'Service Bay overview'}><DetailInfo items={kind === 'service' ? [
          ['Service', selected.name], ['Duration', `${selected.estimatedDuration} minutes`],
          ['Estimated price', `₱${Number(selected.estimatedPrice).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`],
          ['Reminder interval', selected.maintenanceReminderInterval ? `${selected.maintenanceReminderInterval} days` : 'Not configured'],
          ['Mileage interval', selected.maintenanceIntervalKm ? `${Number(selected.maintenanceIntervalKm).toLocaleString()} km` : 'Not configured'],
          ['Type', selected.type], ['Description', selected.description || 'Record unavailable'],
        ] : [['Service Bay', selected.name], ['Operational status', selected.operationalStatus.replaceAll('_', ' ')], ['Availability', selected.availability?.replaceAll('_', ' ')]]} /></DetailSection>
        {kind === 'bay' && selected.activeAssignments?.length > 0 && <DetailSection title="Active assignment"><Stack spacing={1}>{selected.activeAssignments.map((assignment, index) => <Box key={assignment.jobOrderId || assignment.bookingId || index}><Typography sx={{ fontSize: 13 }}>{assignment.vehiclePlate || 'Vehicle unavailable'} · {statusStyles[assignment.bookingStatus]?.label || 'Active job'}</Typography><Button size="small" component={Link} to={assignment.jobOrderId ? `/admin/job-orders?open=${assignment.jobOrderId}` : `/admin/bookings?open=${assignment.bookingId}`}>{assignment.jobOrderId ? 'View job order' : 'View booking'}</Button></Box>)}</Stack></DetailSection>}
        {kind === 'service' && <DetailSection title={`Service checklist · ${selected.checklistTemplate?.length || 0} items`}>
          {selected.checklistTemplate?.length ? <Box component="ul" className="service-detail-checklist" aria-label="Service checklist items">
            {selected.checklistTemplate.map((item, index) => <Typography component="li" key={`${index}-${item}`} title={item}>{item}</Typography>)}
          </Box> : <Typography className="service-detail-empty">No checklist configured.</Typography>}
        </DetailSection>}
      </>}
    </DetailDialog>
    <Dialog className={kind === 'service' ? 'service-form-dialog' : 'bay-form-dialog'} open={formOpen} onClose={() => { if (!saving) setEditing(null) }} fullWidth maxWidth={kind === 'service' ? false : 'sm'} aria-labelledby="master-form-title">
      <Box component="form" noValidate onSubmit={save}>
        <DialogTitle id="master-form-title">{kind === 'service' ? `${editing?._id ? 'Edit' : 'Add'} Service` : `${editing?._id ? 'Edit' : 'Add'} Bay`}</DialogTitle>
        <DialogContent>{kind === 'service' ? <Box className="service-form-fields">
          {formError && <Alert className="service-form-wide" severity="error">{formError}</Alert>}
          <TextField className="service-form-wide" label="Name" value={form.name || ''} {...validation.field('name')} disabled={saving || form.isOtherService}
            onChange={event => change('name', event.target.value)} required fullWidth slotProps={{ htmlInput: { maxLength: 120 } }} />
          <TextField className="service-form-wide" label="Description" value={form.description || ''} {...validation.field('description')} onChange={event => change('description', event.target.value)} multiline minRows={3} fullWidth slotProps={{ htmlInput: { maxLength: 3000 } }} />
          <TextField className="service-form-wide" select label="Service type" value={form.type || ''} {...validation.field('type')} onChange={event => change('type', event.target.value)} required disabled={saving || form.isOtherService} fullWidth slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}>
            <MenuItem value="" disabled>Select service type</MenuItem><MenuItem value="Maintenance">Maintenance</MenuItem><MenuItem value="Diagnostic">Diagnostic</MenuItem>
          </TextField>
          {form.isOtherService && <Alert className="service-form-wide" severity="info">This diagnostic estimate is used for booking availability. The final service duration is confirmed after assessment.</Alert>}
          <TextField label="Duration (minutes)" type="number" value={form.estimatedDuration} {...validation.field('estimatedDuration')} onChange={event => change('estimatedDuration', event.target.value)} required fullWidth slotProps={{ htmlInput: { min: 1, step: 1 } }} />
          <TextField label="Estimated price (PHP)" type="number" value={form.estimatedPrice} {...validation.field('estimatedPrice')} onChange={event => change('estimatedPrice', event.target.value)} required fullWidth slotProps={{ htmlInput: { min: 0, step: 'any' } }} />
          <TextField label="Reminder interval (days, optional)" type="number" value={form.maintenanceReminderInterval} {...validation.field('maintenanceReminderInterval')} onChange={event => change('maintenanceReminderInterval', event.target.value)} fullWidth slotProps={{ htmlInput: { min: 1, step: 1 } }} />
          <TextField label="Mileage interval (km, optional)" type="number" value={form.maintenanceIntervalKm} onChange={event => change('maintenanceIntervalKm', event.target.value)} fullWidth slotProps={{ htmlInput: { min: 1, max: 9999999, step: 1 } }} />
          <Box className="service-checklist-editor service-form-wide">
            <Box className="service-checklist-heading"><Typography>Service checklist</Typography><Typography>{(form.checklistTemplate || []).length}/10</Typography></Box>
            <Box className="service-checklist-add-row">
              <TextField size="small" label="Checklist item" value={checklistDraft} onChange={event => setChecklistDraft(event.target.value)} disabled={saving} fullWidth slotProps={{ htmlInput: { maxLength: 500 } }} />
              <Button variant="outlined" onClick={addChecklistItem} disabled={saving || !checklistDraft.trim() || (form.checklistTemplate || []).length >= 10}>Add</Button>
            </Box>
            {checklistError && <Typography role="alert" className="service-checklist-error">{checklistError}</Typography>}
            {(form.checklistTemplate || []).length ? <Box component="ul" className="service-checklist-items">
              {form.checklistTemplate.map((item, index) => <Box component="li" key={`${index}-${item}`}>
                <TextField size="small" label={`Checklist item ${index + 1}`} value={item} disabled={saving} onChange={event => {
                  const next = [...form.checklistTemplate]; next[index] = event.target.value; change('checklistTemplate', next); setChecklistError('')
                }} required fullWidth slotProps={{ htmlInput: { maxLength: 500 } }} />
                <IconButton aria-label={`Remove checklist item ${index + 1}`} title="Remove item" disabled={saving} onClick={() => {
                  change('checklistTemplate', form.checklistTemplate.filter((_, itemIndex) => itemIndex !== index)); setChecklistError('')
                }}><Xmark width={17} height={17} strokeWidth={1.7} /></IconButton>
              </Box>)}</Box> : <Typography className="service-checklist-empty">No checklist items added yet.</Typography>}
          </Box>
          <FormControlLabel className="service-form-wide service-availability-toggle" control={<Switch checked={Boolean(form.isActive)} disabled={Boolean(form.isOtherService)} onChange={event => change('isActive', event.target.checked)} />} label="Available for future booking" />
        </Box> : <Stack spacing={2} sx={{ pt: 1 }}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <TextField label="Bay name" placeholder="e.g. BAY 6" value={form.name || ''} {...validation.field('name')} error={bayNameCheck.duplicate || Boolean(validation.errors.name)} helperText={validation.errors.name || bayNameCheck.message} disabled={saving}
            onChange={event => change('name', event.target.value)} required fullWidth slotProps={{ htmlInput: { maxLength: 80 }, formHelperText: { 'aria-live': 'polite' } }} />
          <TextField select label="Operational status" value={form.operationalStatus} {...validation.field('operationalStatus')} onChange={event => change('operationalStatus', event.target.value)} fullWidth>
            {bayStatuses.map(option => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
          </TextField>
        </Stack>}</DialogContent>
        <DialogActions sx={{ p: 2.5 }}><Button onClick={() => setEditing(null)} disabled={saving}>Cancel</Button><Button type="submit" variant="contained" disabled={saving || (kind === 'bay' && (bayNameCheck.blocked || validation.errors.name === SERVICE_BAY_DUPLICATE))}>{saving ? 'Saving…' : kind === 'bay' && !editing?._id ? 'Create Bay' : 'Save'}</Button></DialogActions>
      </Box>
    </Dialog>
    <ConfirmationDialog open={Boolean(archiveTarget)} busy={saving} onCancel={() => setArchiveTarget(null)} onConfirm={toggleArchive}
      message={`Are you sure you want to ${archiveTarget?.isArchived ? 'restore' : 'archive'} this ${definition.singular}?`}
      details={archiveTarget?.isArchived ? 'The record will return to the current list.' : 'The record will be retained for historical records and removed from the current list.'} />
  </>
}
