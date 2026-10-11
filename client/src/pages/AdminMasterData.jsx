import ConfirmationDialog from '../components/ConfirmationDialog'
import { useConfirmation } from '../components/ConfirmationContext'
import useFormValidation from '../components/useFormValidation'
import useServiceBayNameCheck from '../components/useServiceBayNameCheck'
import { SERVICE_BAY_DUPLICATE } from '../../../shared/serviceBayName.mjs'
import { useState } from 'react'
import useCatalog, { message as errorMessage } from './useCatalog'
import ListPagination from '../components/ListPagination'
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Paper, Stack, Switch, TextField, Typography } from '@mui/material'
import AddRounded from '@mui/icons-material/AddRounded'
import api from '../services/api'
import { PageHeading } from '../components/DashboardParts'

const definitions = {
  service: {
    title: 'Services', singular: 'service', endpoint: '/services',
    empty: { name: '', description: '', estimatedDuration: '', estimatedPrice: '', maintenanceReminderInterval: '', isActive: true, isOtherService: false, checklistTemplate: [''] },
  },
  bay: {
    title: 'Service bays', singular: 'bay', endpoint: '/service-bays',
    empty: { name: '', operationalStatus: 'operational' },
  },
}
const bayStatuses = [
  { value: 'operational', label: 'Operational' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'out_of_service', label: 'Out of service' },
]
function payload(kind, form) {
  if (kind === 'bay') return { name: form.name.trim(), operationalStatus: form.operationalStatus }
  return {
    name: form.name.trim(), description: form.description.trim(),
    estimatedDuration: Number(form.estimatedDuration), estimatedPrice: Number(form.estimatedPrice),
    maintenanceReminderInterval: form.maintenanceReminderInterval === '' ? null : Number(form.maintenanceReminderInterval),
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
  const [form, setForm] = useState(definition.empty)
  const [formError, setFormError] = useState('')
  const [checklistError, setChecklistError] = useState('')
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
      estimatedPrice: String(item.estimatedPrice), maintenanceReminderInterval: item.maintenanceReminderInterval == null ? '' : String(item.maintenanceReminderInterval), isActive: item.isActive,
      isOtherService: item.isOtherService === true,
      checklistTemplate: item.checklistTemplate?.length ? [...item.checklistTemplate] : [''],
    } : { name: item.name, operationalStatus: item.operationalStatus } : { ...definition.empty, checklistTemplate: [...(definition.empty.checklistTemplate || [])] })
    setFormError('')
    setChecklistError('')
  }
  function change(key, value) { setForm(current => ({ ...current, [key]: value })); setFormError('') }
  async function save(event) {
    event.preventDefault()
    if (saving || !validation.validate() || (kind === 'bay' && bayNameCheck.blocked)) return
    let formToSave = form
    if (kind === 'service') {
      const checklistItems = form.checklistTemplate.map(item => item.trim())
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
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderColor: 'var(--line)', borderRadius: 2.5 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2.5 }}>
        <TextField label="Search by name" size="small" value={search} slotProps={{ htmlInput: { maxLength: 100 } }} onChange={event => setSearch(event.target.value)} sx={{ flex: 1, minWidth: 0 }} />
        <TextField select label="Records" size="small" value={archive} onChange={event => setArchive(event.target.value)} sx={{ minWidth: { sm: 145 } }}>
          <MenuItem value="active">Current</MenuItem><MenuItem value="archived">Archived</MenuItem><MenuItem value="all">All</MenuItem>
        </TextField>
        <TextField select label="Status" size="small" value={status} onChange={event => setStatus(event.target.value)} sx={{ minWidth: { sm: 165 } }}>
          <MenuItem value="all">All statuses</MenuItem>
          {kind === 'service' ? [<MenuItem key="active" value="active">Active</MenuItem>, <MenuItem key="inactive" value="inactive">Inactive</MenuItem>]
            : bayStatuses.map(option => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
        </TextField>
        <Button variant="contained" startIcon={<AddRounded />} onClick={() => openForm({})} sx={{ flexShrink: 0 }}>Add {definition.singular}</Button>
      </Stack>
      {loading ? <Stack alignItems="center" sx={{ py: 6 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 2, fontSize: 13 }}>Loading {definition.title.toLowerCase()}…</Typography></Stack>
        : !items.length ? <Typography sx={{ py: 5, textAlign: 'center', color: 'text.secondary', fontSize: 13 }}>No {definition.title.toLowerCase()} match these filters.</Typography>
          : <Stack spacing={1}>{items.map(item => <Box key={item._id} sx={{ p: 2, border: '1px solid var(--line)', borderRadius: 2, bgcolor: item.isArchived ? 'var(--surface-soft)' : 'var(--surface)', display: 'flex', alignItems: { xs: 'stretch', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 2, minWidth: 0 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center"><Typography sx={{ fontSize: 14, fontWeight: 650, overflowWrap: 'anywhere' }}>{item.name}</Typography>{kind === 'service' && item.isOtherService && <Chip size="small" label="Diagnostic" />}</Stack>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: .5, overflowWrap: 'anywhere' }}>{kind === 'service'
                ? `${item.estimatedDuration} min · ₱${Number(item.estimatedPrice).toLocaleString()}${item.description ? ` · ${item.description}` : ''}`
                : item.operationalStatus.replaceAll('_', ' ')}</Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Chip size="small" label={item.isArchived ? 'Archived' : kind === 'service' ? item.isActive ? 'Active' : 'Inactive' : item.operationalStatus.replaceAll('_', ' ')} sx={{ bgcolor: item.isArchived ? 'var(--surface-soft)' : kind === 'service' && item.isActive || kind === 'bay' && item.operationalStatus === 'operational' ? 'var(--green-soft)' : 'var(--amber-soft)', color: item.isArchived ? 'var(--muted)' : 'var(--green-ink)' }} />
              {!item.isArchived && <Button size="small" variant="outlined" onClick={() => openForm(item)}>Edit</Button>}
              {!(kind === 'service' && item.isOtherService && !item.isArchived) && <Button size="small" color={item.isArchived ? 'primary' : 'inherit'} onClick={() => setArchiveTarget(item)}>{item.isArchived ? 'Restore' : 'Archive'}</Button>}
            </Stack>
          </Box>)}</Stack>}
      <ListPagination pagination={pagination} />
    </Paper>
    <Dialog open={formOpen} onClose={() => { if (!saving) setEditing(null) }} fullWidth maxWidth="sm" aria-labelledby="master-form-title">
      <Box component="form" noValidate onSubmit={save}>
        <DialogTitle id="master-form-title">{editing?._id ? 'Edit' : 'Add'} {definition.singular}</DialogTitle>
        <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <TextField label="Name" value={form.name || ''} {...validation.field('name')} disabled={saving || (kind === 'service' && form.isOtherService)}
            {...(kind === 'bay' ? { error: bayNameCheck.duplicate || Boolean(validation.errors.name), helperText: validation.errors.name || bayNameCheck.message, disabled: saving } : {})}
            onChange={event => change('name', event.target.value)} required fullWidth slotProps={{ htmlInput: { maxLength: kind === 'service' ? 120 : 80 }, ...(kind === 'bay' ? { formHelperText: { 'aria-live': 'polite' } } : {}) }} />
          {kind === 'service' ? <>
            <TextField label="Description" value={form.description || ''} {...validation.field('description')} onChange={event => change('description', event.target.value)} multiline minRows={2} fullWidth slotProps={{ htmlInput: { maxLength: 3000 } }} />
            {form.isOtherService && <Alert severity="info">This diagnostic estimate is used for booking availability. The final service duration is confirmed after assessment.</Alert>}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Duration (minutes)" type="number" value={form.estimatedDuration} {...validation.field('estimatedDuration')} onChange={event => change('estimatedDuration', event.target.value)} required fullWidth slotProps={{ htmlInput: { min: 1, step: 1 } }} />
              <TextField label="Estimated price (PHP)" type="number" value={form.estimatedPrice} {...validation.field('estimatedPrice')} onChange={event => change('estimatedPrice', event.target.value)} required fullWidth slotProps={{ htmlInput: { min: 0, step: 'any' } }} />
            </Stack>
            <TextField label="Reminder interval (days, optional)" type="number" value={form.maintenanceReminderInterval} {...validation.field('maintenanceReminderInterval')} onChange={event => change('maintenanceReminderInterval', event.target.value)} fullWidth slotProps={{ htmlInput: { min: 1, step: 1 } }} />
            <Box>
              <Typography sx={{ fontSize: 14, fontWeight: 650, mb: 1 }}>Service Checklist</Typography>
              <Stack spacing={1}>
                {(form.checklistTemplate || ['']).map((item, index) => <Stack key={index} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'flex-start' }}>
                  <TextField label={`Checklist item ${index + 1}`} value={item} onChange={event => {
                    const next = [...form.checklistTemplate]; next[index] = event.target.value; change('checklistTemplate', next); setChecklistError('')
                  }} required fullWidth slotProps={{ htmlInput: { maxLength: 500 } }} />
                  <Button color="inherit" disabled={saving} onClick={() => {
                    const next = form.checklistTemplate.filter((_, itemIndex) => itemIndex !== index)
                    change('checklistTemplate', next); setChecklistError('')
                  }}>Remove</Button>
                </Stack>)}
              </Stack>
              {checklistError && <Typography role="alert" sx={{ mt: .75, color: 'error.main', fontSize: 12 }}>{checklistError}</Typography>}
              <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1 }}>
                <Button variant="outlined" disabled={saving || (form.checklistTemplate || []).length >= 10}
                  onClick={() => change('checklistTemplate', [...(form.checklistTemplate || []), ''])}>+ Add checklist item</Button>
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{(form.checklistTemplate || []).length} of 10 items</Typography>
              </Stack>
            </Box>
            <FormControlLabel control={<Switch checked={Boolean(form.isActive)} disabled={Boolean(form.isOtherService)} onChange={event => change('isActive', event.target.checked)} />} label="Available for future booking" />
          </> : <TextField select label="Operational status" value={form.operationalStatus} {...validation.field('operationalStatus')} onChange={event => change('operationalStatus', event.target.value)} fullWidth>
            {bayStatuses.map(option => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
          </TextField>}
        </Stack></DialogContent>
        <DialogActions sx={{ p: 2.5 }}><Button onClick={() => setEditing(null)} disabled={saving}>Cancel</Button><Button type="submit" variant="contained" disabled={saving || (kind === 'bay' && (bayNameCheck.blocked || validation.errors.name === SERVICE_BAY_DUPLICATE))}>{saving ? 'Saving…' : kind === 'bay' && !editing?._id ? 'Create' : 'Save'}</Button></DialogActions>
      </Box>
    </Dialog>
    <ConfirmationDialog open={Boolean(archiveTarget)} busy={saving} onCancel={() => setArchiveTarget(null)} onConfirm={toggleArchive}
      message={`Are you sure you want to ${archiveTarget?.isArchived ? 'restore' : 'archive'} this ${definition.singular}?`}
      details={archiveTarget?.isArchived ? 'The record will return to the current list.' : 'The record will be retained for historical records and removed from the current list.'} />
  </>
}
