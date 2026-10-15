import { DetailsButton, MoreActionsMenu } from '../components/RowActions'
import { useState } from 'react'
import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material'
import AccountFormDialog from '../components/AccountFormDialog'
import { PageHeading } from '../components/DashboardParts'
import useCatalog, { message } from './useCatalog'
import useFormValidation from '../components/useFormValidation'
import { normalizeMobile, restrictMobileInput, REGISTRATION_MOBILE_HINT } from '../../../shared/accountValidation.mjs'
import api from '../services/api'
import RecordList, { RecordActions, RecordPanel } from '../components/RecordList'
import PersonRecordCard from '../components/PersonRecordCard'
import { AccountRecordDetails, AccountStatus, DetailDialog, DetailGrid, DetailInfo, DetailSection, DetailVehicle } from '../components/RecordDetails'
import StatusChip, { StatusBadge } from '../components/StatusChip'
import { dateLabel } from './bookingDisplay'
import { useConfirmation } from '../components/ConfirmationContext'

export function CustomersDirectory({ role }) {
  const [search, setSearch] = useState('')
  const { items, loading, error } = useCatalog('/people/customers', { search })
  const [selected, setSelected] = useState(null)
  const [detailError, setDetailError] = useState('')
  async function inspect(id) {
    try { setDetailError(''); setSelected((await api.get(`/people/customers/${id}`)).data) }
    catch (error) { setDetailError(message(error)) }
  }
  return <>
    <PageHeading title={role === 'admin' ? 'Customer & vehicle monitoring' : 'Customers'} subtitle="View customer vehicles and booking history." preview={false} />
    <RecordPanel><TextField fullWidth size="small" label="Search customer name, email, or phone" value={search} onChange={event => setSearch(event.target.value)} slotProps={{ htmlInput: { maxLength: 100 } }} />
      {(error || detailError) && <Alert severity="error" sx={{ mt: 2 }}>{error || detailError}</Alert>}
      <Box sx={{ mt: 2 }}><RecordList items={items} selectionKey={search} loading={loading && <Typography>Loading customers...</Typography>} empty="No customers match this view.">
        {item => <PersonRecordCard key={item._id} person={item} supportingDetail={item.isWalkInCustomer ? 'Walk-In Customer' : 'Online Client'}>
          <RecordActions statuses={<StatusBadge label={item.status} />}><DetailsButton onClick={() => inspect(item._id)}>Details</DetailsButton></RecordActions>
        </PersonRecordCard>}
      </RecordList></Box></RecordPanel>
    <DetailDialog open={Boolean(selected)} onClose={() => setSelected(null)} title="Customer details"
      reference={selected?.customer?.fullName} status={selected && <AccountStatus account={selected.customer} />}>
      {selected && <>
        <AccountRecordDetails account={selected.customer} kind="customer" />
        <DetailSection title="Vehicles"><DetailGrid>{selected.vehicles?.length ? selected.vehicles.map(vehicle =>
          <DetailSection key={vehicle._id} title={`${vehicle.make} ${vehicle.model}`}><DetailVehicle vehicle={vehicle} /></DetailSection>)
          : <Typography color="text.secondary" fontSize={13}>No vehicles registered.</Typography>}</DetailGrid></DetailSection>
        <DetailSection title="Booking and service history"><Stack spacing={1.5}>
          {selected.bookings?.length ? selected.bookings.map(booking => <DetailSection key={booking._id} title={dateLabel(booking.bookingDate)}>
            <Box sx={{ mb: 1.5 }}><StatusChip status={booking.status} /></Box>
            <DetailInfo items={[["Reference", booking._id], ["Services", (booking.services || []).map(service => service?.name || 'Record unavailable').join(', ')]]} />
          </DetailSection>) : <Typography color="text.secondary" fontSize={13}>No bookings recorded.</Typography>}
        </Stack></DetailSection>
      </>}
    </DetailDialog>
  </>
}

const emptyStaff = { firstName: '', lastName: '', email: '', phone: '' }
export function StaffDirectory() {
  const confirm = useConfirmation()
  const { items, loading, error, reload } = useCatalog('/people/staff', {})
  const [form, setForm] = useState(emptyStaff)
  const validation = useFormValidation('staff', form)
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [noticeSeverity, setNoticeSeverity] = useState('success')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const [previewId, setPreviewId] = useState('')
  const [previewError, setPreviewError] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  async function openCreate() {
    validation.reset(); setActionError(''); setPreviewId(''); setPreviewError(''); setPreviewLoading(true); setOpen(true)
    try { setPreviewId((await api.get('/people/staff/next-id')).data.staffId) }
    catch (requestError) { setPreviewError(message(requestError)) }
    finally { setPreviewLoading(false) }
  }
  async function create(event) {
    event.preventDefault()
    if (busy || previewLoading || !previewId || !validation.validate()) return
    setBusy(true); setActionError('')
    try {
      const payload = { firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim(),
        phone: normalizeMobile(form.phone) }
      const { data } = await api.post('/people/staff', payload)
      setNotice(`${data.message} Staff ID: ${data.item.staffId}.`); setNoticeSeverity(data.emailSent ? 'success' : 'warning')
      setOpen(false); setForm(emptyStaff); reload()
    } catch (requestError) {
      validation.receive(requestError)
      setActionError(requestError.response?.data?.errors ? '' : message(requestError))
    } finally { setBusy(false) }
  }
  async function change(item) {
    if (busy) return
    const apply = async () => {
      setBusy(true); setActionError('')
      try { await api.patch(`/people/staff/${item._id}/status`, { status: item.status === 'active' ? 'inactive' : 'active' }); setNotice('Staff account status updated.'); setNoticeSeverity('success'); reload() }
      catch (requestError) { setActionError(message(requestError)) }
      finally { setBusy(false) }
    }
    return item.status === 'active' ? confirm('Are you sure you want to disable this staff account?', apply) : apply()
  }
  return <>
    <PageHeading title="Staff monitoring" subtitle="Manage staff access and review account status." preview={false} />
    {(error || actionError) && <Alert severity="error" sx={{ mb: 2 }}>{error || actionError}</Alert>}
    {notice && <Alert severity={noticeSeverity} sx={{ mb: 2 }}>{notice}</Alert>}
    <RecordPanel><Button variant="contained" onClick={openCreate} sx={{ mb: 2 }}>Add staff</Button>
      <RecordList items={items} loading={loading && <Typography>Loading staff...</Typography>} empty="No staff records to show.">
        {item => <PersonRecordCard key={item._id} person={item} idLabel="Staff ID" idValue={item.staffId} activity={`${item.processedBookings || 0} bookings processed`}>
          <RecordActions statuses={<StatusBadge label={item.status} />}><DetailsButton onClick={() => setSelected(item)}>Details</DetailsButton><MoreActionsMenu label={item.fullName} disabled={busy} items={[{ label: item.status === 'active' ? 'Disable' : 'Enable', destructive: item.status === 'active', onClick: () => change(item) }]} /></RecordActions>
        </PersonRecordCard>}
      </RecordList>
    </RecordPanel>
    <DetailDialog open={Boolean(selected)} onClose={() => setSelected(null)} title="Staff details" reference={selected?.staffId || selected?._id}
      status={selected && <AccountStatus account={selected} />}>
      {selected && <AccountRecordDetails account={selected} kind="staff" />}
    </DetailDialog>
    <AccountFormDialog open={open} onClose={() => { if (!busy) setOpen(false) }} id="staff-form-title" title="Add Staff" onSubmit={create}
      actions={<><Button disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={busy || previewLoading || !previewId} variant="contained">Create Staff</Button></>}>
        <TextField size="small" required disabled={busy} label="First Name" value={form.firstName} {...validation.field('firstName')} onChange={event => setForm({ ...form, firstName: event.target.value })} slotProps={{ htmlInput: { maxLength: 40 } }} />
        <TextField size="small" required disabled={busy} label="Last Name" value={form.lastName} {...validation.field('lastName')} onChange={event => setForm({ ...form, lastName: event.target.value })} slotProps={{ htmlInput: { maxLength: 40 } }} />
        <TextField size="small" required disabled={busy} type="email" label="Email" value={form.email} {...validation.field('email')} onChange={event => setForm({ ...form, email: event.target.value })} />
        <TextField size="small" required disabled={busy} type="tel" label="Phone" value={form.phone} {...validation.field('phone', REGISTRATION_MOBILE_HINT)} onChange={event => setForm({ ...form, phone: restrictMobileInput(event.target.value) })} />
        <TextField className="account-form-wide" size="small" name="staffId" label="Staff ID" value={previewLoading ? 'Generating...' : previewId} slotProps={{ input: { readOnly: true } }} helperText="Assigned when the account is created. This preview may change if another staff member is created first." />
        {previewError && <Alert className="account-form-wide" severity="error">Could not load the next Staff ID: {previewError}</Alert>}
    </AccountFormDialog>
  </>
}
