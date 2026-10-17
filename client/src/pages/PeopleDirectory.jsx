import { useState } from 'react'
import { Alert, Box, Button, CircularProgress, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { Plus } from 'iconoir-react'
import AccountFormDialog from '../components/AccountFormDialog'
import { PageHeading } from '../components/DashboardParts'
import useCatalog, { message } from './useCatalog'
import useFormValidation from '../components/useFormValidation'
import { normalizeMobile, restrictMobileInput, REGISTRATION_MOBILE_HINT } from '../../../shared/accountValidation.mjs'
import api from '../services/api'
import RecordList, { RecordPanel } from '../components/RecordList'
import { AccountDirectoryHeader } from '../components/AccountDirectoryRow'
import AccountDirectoryRow from '../components/AccountDirectoryRow'
import { CustomerDirectoryHeader } from '../components/CustomerDirectoryRow'
import CustomerDirectoryRow from '../components/CustomerDirectoryRow'
import { AccountRecordDetails, AccountStatus, DetailDialog, DetailSection } from '../components/RecordDetails'
import StatusChip, { MinimalStatus } from '../components/StatusChip'
import { dateLabel } from './bookingDisplay'
import { useConfirmation } from '../components/ConfirmationContext'

export function CustomersDirectory({ role }) {
  const [search, setSearch] = useState('')
  const [customerType, setCustomerType] = useState('all')
  const [status, setStatus] = useState('all')
  const { items, loading, error, pagination } = useCatalog('/people/customers', { search, customerType, status }, role === 'admin')
  const [selected, setSelected] = useState(null)
  const [detailError, setDetailError] = useState('')
  async function inspect(id) {
    try { setDetailError(''); setSelected((await api.get(`/people/customers/${id}`)).data) }
    catch (error) { setDetailError(message(error)) }
  }
  return <>
    <PageHeading title={role === 'admin' ? 'Customer Vehicle Monitoring' : 'Customers'} subtitle="View customer vehicles and booking history." preview={false} />
    <RecordPanel className="customer-directory-panel admin-list-surface">
      <Box className="customer-directory-toolbar admin-list-toolbar">
        <TextField className="customer-directory-search" fullWidth size="small" label="Search customer name, email, or phone" value={search} onChange={event => setSearch(event.target.value)} slotProps={{ htmlInput: { maxLength: 100 } }} />
        <TextField select className="customer-directory-type-filter" label="Customer type" size="small" value={customerType} onChange={event => setCustomerType(event.target.value)}>
          <MenuItem value="all">All customers</MenuItem><MenuItem value="online">Online Client</MenuItem><MenuItem value="walk_in">Walk-In Customer</MenuItem>
        </TextField>
        <TextField select className="customer-directory-status-filter" label="Account status" size="small" value={status} onChange={event => setStatus(event.target.value)}>
          <MenuItem value="all">All statuses</MenuItem><MenuItem value="active">Active</MenuItem><MenuItem value="inactive">Inactive</MenuItem>
        </TextField>
      </Box>
      {(error || detailError) && <Alert severity="error" sx={{ mx: 2, mt: 2 }}>{error || detailError}</Alert>}
      <CustomerDirectoryHeader />
      <RecordList className="customer-directory-list" items={items} pagination={pagination} selectionKey={`${search}|${customerType}|${status}`} loading={loading && <Typography sx={{ p: 2, fontSize: 13 }}>Loading customers...</Typography>} empty="No customers found.">
        {item => <CustomerDirectoryRow key={item._id} customer={item} onDetails={() => inspect(item._id)} />}
      </RecordList>
    </RecordPanel>
    <DetailDialog className="account-management-dialog customer-details-dialog" paperSx={{ width: 'min(680px, calc(100vw - 32px))', maxWidth: 680, borderRadius: '14px' }} open={Boolean(selected)} onClose={() => setSelected(null)} title="Customer details"
      reference={selected?.customer?.fullName} status={selected && <AccountStatus account={selected.customer} minimal />}>
      {selected && <>
        <AccountRecordDetails account={selected.customer} kind="customer" />
        <DetailSection title={`Registered vehicles · ${selected.vehicles?.length || 0}`}>
          {selected.vehicles?.length ? <Box component="ul" className="customer-detail-list" aria-label="Registered vehicles">
            {selected.vehicles.map(vehicle => <Box component="li" className="customer-vehicle-row" key={vehicle._id}>
              <Box sx={{ minWidth: 0 }}><Typography className="customer-detail-primary" title={`${vehicle.make} ${vehicle.model}`}>{vehicle.make} {vehicle.model}</Typography>
                <Typography className="customer-detail-secondary" title={`${vehicle.plateNumber} · ${vehicle.year}`}>{vehicle.plateNumber} · {vehicle.year}</Typography></Box>
              <MinimalStatus label={vehicle.isArchived ? 'Archived' : 'Active'} status={vehicle.isArchived ? 'archived' : 'active'} />
            </Box>)}
          </Box> : <Typography className="customer-detail-empty">No vehicles registered.</Typography>}
        </DetailSection>
        <DetailSection title={`Booking & service history · ${selected.bookings?.length || 0}`}>
          {selected.bookings?.length ? <Box component="ul" className="customer-detail-list" aria-label="Booking and service history">
            {selected.bookings.map(booking => <Box component="li" className="customer-booking-row" key={booking._id}>
              <Typography className="customer-detail-primary">{dateLabel(booking.bookingDate)}</Typography>
              <Typography className="customer-detail-secondary" title={(booking.services || []).map(service => service?.name || 'Record unavailable').join(', ')}>
                {(booking.services || []).map(service => service?.name || 'Record unavailable').join(', ') || 'Service details unavailable'}
              </Typography>
              <StatusChip status={booking.status} minimal />
            </Box>)}
          </Box> : <Typography className="customer-detail-empty">No bookings recorded.</Typography>}
        </DetailSection>
      </>}
    </DetailDialog>
  </>
}

const emptyStaff = { firstName: '', lastName: '', email: '', phone: '' }
export function StaffDirectory() {
  const confirm = useConfirmation()
  const [archive, setArchive] = useState('active')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const { items, loading, error, reload, pagination } = useCatalog('/people/staff', { archive, search, status }, true)
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
    <PageHeading title="Staff Monitoring" subtitle="Manage staff access and review account status." preview={false} />
    {(error || actionError) && <Alert severity="error" sx={{ mb: 2 }}>{error || actionError}</Alert>}
    {notice && <Alert severity={noticeSeverity} sx={{ mb: 2 }}>{notice}</Alert>}
    <RecordPanel className="account-directory-panel admin-list-surface">
      <Box className="account-directory-toolbar admin-list-toolbar">
        <TextField className="account-directory-search" label="Search staff" size="small" value={search} slotProps={{ htmlInput: { maxLength: 100 } }} onChange={event => setSearch(event.target.value)} />
        <TextField select label="Records" size="small" value={archive} onChange={event => setArchive(event.target.value)}><MenuItem value="active">Current</MenuItem><MenuItem value="archived">Archived</MenuItem><MenuItem value="all">All registered</MenuItem></TextField>
        <TextField select label="Account" size="small" value={status} onChange={event => setStatus(event.target.value)}><MenuItem value="all">All statuses</MenuItem><MenuItem value="active">Active</MenuItem><MenuItem value="inactive">Inactive</MenuItem></TextField>
        <Button className="account-directory-add" variant="contained" startIcon={<Plus width={16} height={16} strokeWidth={1.8} />} onClick={openCreate}>Add Staff</Button>
      </Box>
      <AccountDirectoryHeader kind="staff" />
      <RecordList className="account-directory-list" items={items} pagination={pagination} loading={loading && <Stack alignItems="center" sx={{ py: 6 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 1 }}>Loading staff…</Typography></Stack>} empty="No staff records match these filters.">
        {item => <AccountDirectoryRow key={item._id} kind="staff" person={item} metric={item.processedBookings || 0} onDetails={() => setSelected(item)} menuDisabled={busy}
          menuItems={!item.isArchived ? [{ label: item.status === 'active' ? 'Disable' : 'Enable', destructive: item.status === 'active', onClick: () => change(item) }] : []} />}
      </RecordList>
    </RecordPanel>
    <DetailDialog className="account-management-dialog" paperSx={{ width: 'min(680px, calc(100vw - 32px))', maxWidth: 680, borderRadius: '14px' }} open={Boolean(selected)} onClose={() => setSelected(null)} title="Staff details" reference={selected?.staffId || selected?._id}
      status={selected && <AccountStatus account={selected} minimal />}>
      {selected && <AccountRecordDetails account={selected} kind="staff" />}
    </DetailDialog>
    <AccountFormDialog open={open} onClose={() => { if (!busy) setOpen(false) }} id="staff-form-title" title="Add Staff" onSubmit={create}
      actions={<><Button disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={busy || previewLoading || !previewId} variant="contained">Create Staff</Button></>}>
        <TextField size="small" required disabled={busy} label="First Name" value={form.firstName} {...validation.field('firstName')} onChange={event => setForm({ ...form, firstName: event.target.value })} slotProps={{ htmlInput: { maxLength: 40 } }} />
        <TextField size="small" required disabled={busy} label="Last Name" value={form.lastName} {...validation.field('lastName')} onChange={event => setForm({ ...form, lastName: event.target.value })} slotProps={{ htmlInput: { maxLength: 40 } }} />
        <TextField size="small" required disabled={busy} type="email" label="Email" value={form.email} {...validation.field('email')} onChange={event => setForm({ ...form, email: event.target.value })} />
        <TextField size="small" required disabled={busy} type="tel" label="Phone" value={form.phone} {...validation.field('phone', REGISTRATION_MOBILE_HINT)} onChange={event => setForm({ ...form, phone: restrictMobileInput(event.target.value) })} />
        <TextField className="account-form-wide account-id-field" size="small" name="staffId" label="Staff ID" value={previewLoading ? 'Generating...' : previewId} slotProps={{ input: { readOnly: true } }} helperText="Auto-generated; assigned when the account is created." />
        {previewError && <Alert className="account-form-wide" severity="error">Could not load the next Staff ID: {previewError}</Alert>}
    </AccountFormDialog>
  </>
}
