import ConfirmationDialog from '../components/ConfirmationDialog'
import { useConfirmation } from '../components/ConfirmationContext'
import useFormValidation from '../components/useFormValidation'
import { useEffect, useState } from 'react'
import { Alert, Box, Button, CircularProgress, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { Plus } from 'iconoir-react'
import api from '../services/api'
import { PageHeading } from '../components/DashboardParts'
import useCatalog, { message } from './useCatalog'
import RecordList, { RecordPanel } from '../components/RecordList'
import AccountDirectoryRow, { AccountDirectoryHeader } from '../components/AccountDirectoryRow'
import { REGISTRATION_MOBILE_HINT, normalizeMobile, restrictMobileInput } from '../../../shared/accountValidation.mjs'
import { mechanicAvailabilityLabel } from '../utils/mechanicAvailability'
import { AccountRecordDetails, AccountStatus, DetailDialog } from '../components/RecordDetails'
import AccountFormDialog from '../components/AccountFormDialog'
import MechanicCreatedDialog from '../components/MechanicCreatedDialog'

const empty = { firstName: '', lastName: '', fullName: '', email: '', phone: '', status: 'active', availability: 'available' }
const availability = ['available', 'busy', 'off_duty']

export default function AdminMechanics() {
  const confirm = useConfirmation()
  const [archive, setArchive] = useState('active')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [availabilityFilter, setAvailabilityFilter] = useState('all')
  const { items, loading, error, setError, reload, pagination } = useCatalog('/mechanics', { archive, search, status, availability: availabilityFilter }, true)
  const [notice, setNotice] = useState('')
  const [noticeSeverity, setNoticeSeverity] = useState('success')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [formError, setFormError] = useState('')
  const splitName = !editing?._id || Boolean(editing.firstName && editing.lastName)
  const validation = useFormValidation(editing?._id ? splitName ? 'mechanicNamedEdit' : 'mechanic' : 'mechanicCreate', form)
  const [saving, setSaving] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState(null)
  const [selected, setSelected] = useState(null)
  const [idPreview, setIdPreview] = useState({ value: '', loading: false, error: '' })
  const [createdAccount, setCreatedAccount] = useState(null)

  useEffect(() => {
    if (!editing || editing._id) return
    const controller = new AbortController()
    api.get('/mechanics/next-id', { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setIdPreview({ value: data.employeeId, loading: false, error: '' }) })
      .catch(error => { if (!controller.signal.aborted) setIdPreview({ value: '', loading: false, error: message(error) }) })
    return () => controller.abort()
  }, [editing])

  function openForm(item = {}) {
    validation.reset()
    setEditing(item)
    setForm(item._id ? { firstName: item.firstName || '', lastName: item.lastName || '', fullName: item.fullName, email: item.email, phone: item.phone || '', status: item.status, availability: item.availability } : { ...empty })
    setIdPreview({ value: item.employeeId || '', loading: !item._id, error: '' })
    setFormError('')
  }
  function change(key, value) { setForm(current => ({ ...current, [key]: value })); setFormError('') }
  async function save(event) {
    event.preventDefault()
    if (saving || (!editing?._id && (idPreview.loading || idPreview.error || !idPreview.value)) || !validation.validate()) return
    const persist = async () => {
      setSaving(true)
      try {
        const data = { ...(splitName ? { firstName: form.firstName.trim(), lastName: form.lastName.trim() } : { fullName: form.fullName.trim() }), email: form.email.trim().toLowerCase(), phone: normalizeMobile(form.phone),
          ...(editing?._id ? { status: form.status, availability: form.availability } : {}) }
        if (editing?._id) {
          await api.patch(`/mechanics/${editing._id}`, data)
          setNoticeSeverity('success'); setNotice('Mechanic information updated successfully.')
        } else {
          const { data: result } = await api.post('/mechanics', data)
          setNotice(''); setCreatedAccount(result)
        }
        setEditing(null); reload()
      } catch (requestError) { validation.receive(requestError); setFormError(requestError.response?.data?.errors ? '' : message(requestError)) }
      finally { setSaving(false) }
    }
    return editing?._id ? confirm('Are you sure you want to update this information?', persist) : persist()
  }
  async function toggleArchive() {
    if (saving || !archiveTarget) return
    const item = archiveTarget
    setSaving(true)
    try {
      await api.post(`/mechanics/${item._id}/${item.isArchived ? 'restore' : 'archive'}`)
      setArchiveTarget(null); setNotice(`Mechanic ${item.isArchived ? 'restored' : 'archived'}.`); reload()
    } catch (requestError) { setError(message(requestError)); setArchiveTarget(null) }
    finally { setSaving(false) }
  }
  return <>
    <PageHeading title="Mechanics" subtitle="Manage technician accounts and availability." preview={false} />
    {notice && <Alert severity={noticeSeverity} onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    <RecordPanel className="account-directory-panel admin-list-surface">
      <Box className="account-directory-toolbar account-directory-toolbar--mechanics admin-list-toolbar">
        <TextField className="account-directory-search" label="Search mechanics" size="small" value={search} slotProps={{ htmlInput: { maxLength: 100 } }} onChange={event => setSearch(event.target.value)} />
        <TextField select label="Records" size="small" value={archive} onChange={event => setArchive(event.target.value)}><MenuItem value="active">Current</MenuItem><MenuItem value="archived">Archived</MenuItem><MenuItem value="all">All</MenuItem></TextField>
        <TextField select label="Account" size="small" value={status} onChange={event => setStatus(event.target.value)}><MenuItem value="all">All statuses</MenuItem><MenuItem value="active">Active</MenuItem><MenuItem value="inactive">Inactive</MenuItem></TextField>
        <TextField select label="Availability" size="small" value={availabilityFilter} onChange={event => setAvailabilityFilter(event.target.value)}><MenuItem value="all">Any</MenuItem>{availability.map(value => <MenuItem key={value} value={value}>{mechanicAvailabilityLabel(value)}</MenuItem>)}</TextField>
        <Button className="account-directory-add" variant="contained" startIcon={<Plus width={16} height={16} strokeWidth={1.8} />} onClick={() => openForm()}>Add Mechanics</Button>
      </Box>
      <AccountDirectoryHeader kind="mechanic" />
      <RecordList className="account-directory-list" items={items} pagination={pagination} loading={loading && <Stack alignItems="center" sx={{ py: 6 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 1 }}>Loading mechanics…</Typography></Stack>} empty="No mechanics match these filters.">
          {item => <AccountDirectoryRow key={item._id} kind="mechanic" person={item}
            availability={{ label: item.isArchived ? 'Archived' : item.availability === 'off_duty' ? 'Unavailable' : mechanicAvailabilityLabel(item.availability), status: item.isArchived ? 'archived' : item.availability === 'available' ? 'available' : item.availability === 'busy' ? 'busy' : 'unavailable' }}
            onDetails={() => setSelected(item)} menuDisabled={saving}
            menuItems={[!item.isArchived && { label: 'Edit', onClick: () => openForm(item) }, { label: item.isArchived ? 'Restore' : 'Archive', onClick: () => setArchiveTarget(item) }]} />}
      </RecordList>
    </RecordPanel>
    <DetailDialog className="account-management-dialog" paperSx={{ width: 'min(680px, calc(100vw - 32px))', maxWidth: 680, borderRadius: '14px' }} open={Boolean(selected)} onClose={() => setSelected(null)} title="Mechanic details" reference={selected?.employeeId || selected?._id}
      status={selected && <AccountStatus account={selected} minimal />}
      actions={selected && !selected.isArchived && <Button variant="contained" onClick={() => { openForm(selected); setSelected(null) }}>Edit</Button>}>
      {selected && <AccountRecordDetails account={selected} kind="mechanic" />}
    </DetailDialog>
    <AccountFormDialog open={editing !== null} onClose={() => { if (!saving) setEditing(null) }} id="mechanic-form-title" title={editing?._id ? 'Edit Mechanic' : 'Add Mechanic'} onSubmit={save}
      actions={<><Button disabled={saving} onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={saving || (!editing?._id && (idPreview.loading || Boolean(idPreview.error) || !idPreview.value))} variant="contained">{saving ? editing?._id ? 'Saving…' : 'Creating…' : editing?._id ? 'Save' : 'Create Mechanic'}</Button></>}>
        {formError && <Alert className="account-form-wide" severity="error">{formError}</Alert>}
        {splitName ? <>
          <TextField size="small" label="First Name" required disabled={saving} value={form.firstName} {...validation.field('firstName')} onChange={event => change('firstName', event.target.value)} slotProps={{ htmlInput: { maxLength: 40 } }} />
          <TextField size="small" label="Last Name" required disabled={saving} value={form.lastName} {...validation.field('lastName')} onChange={event => change('lastName', event.target.value)} slotProps={{ htmlInput: { maxLength: 40 } }} />
        </> : <TextField className="account-form-wide" size="small" label="Full name" required disabled={saving} value={form.fullName} {...validation.field('fullName')} onChange={event => change('fullName', event.target.value)} />}
        <TextField size="small" label="Email Address" type="email" required disabled={saving} value={form.email} {...validation.field('email')} onChange={event => change('email', event.target.value)} />
        <TextField size="small" label="Phone Number" type="tel" required disabled={saving} value={form.phone} {...validation.field('phone', REGISTRATION_MOBILE_HINT)}
          slotProps={{ htmlInput: { maxLength: 13, inputMode: 'tel' } }}
          onChange={event => change('phone', restrictMobileInput(event.target.value))} />
        <TextField className="account-form-wide account-id-field" size="small" name="employeeId" label="Mechanic ID" value={editing?._id ? editing.employeeId : idPreview.loading ? 'Generating…' : idPreview.value} slotProps={{ input: { readOnly: true } }}
          error={Boolean(idPreview.error)} helperText={idPreview.error || (editing?._id ? 'Assigned by the system.' : 'Auto-generated. The final ID is assigned when the account is created.')} />
        {editing?._id && <>
          <TextField size="small" select label="Account status" disabled={saving} value={form.status} {...validation.field('status')} onChange={event => change('status', event.target.value)} fullWidth><MenuItem value="active">Active</MenuItem><MenuItem value="inactive">Inactive</MenuItem></TextField>
          <TextField size="small" select label="Availability" disabled={saving} value={form.availability} {...validation.field('availability')} onChange={event => change('availability', event.target.value)} fullWidth>{availability.map(value => <MenuItem key={value} value={value}>{mechanicAvailabilityLabel(value)}</MenuItem>)}</TextField>
        </>}
    </AccountFormDialog>
    <MechanicCreatedDialog result={createdAccount} onClose={() => setCreatedAccount(null)} />
    <ConfirmationDialog open={Boolean(archiveTarget)} busy={saving} onCancel={() => setArchiveTarget(null)} onConfirm={toggleArchive}
      message={archiveTarget?.isArchived ? 'Are you sure you want to restore this mechanic?' : 'Are you sure you want to archive this mechanic?'}
      details="Historical records are retained. Unfinished assignments prevent archiving." />
  </>
}
