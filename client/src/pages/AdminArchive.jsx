import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Stack, Tab, Tabs, TextField, Typography } from '@mui/material'
import { Car, NavArrowRight, User, Wrench } from 'iconoir-react'
import api from '../services/api'
import { PageHeading } from '../components/DashboardParts'
import RecordList, { RecordPanel } from '../components/RecordList'
import { MoreActionsMenu } from '../components/RowActions'
import { MinimalStatus } from '../components/StatusChip'
import { DetailDialog, DetailGrid, DetailInfo, DetailSection } from '../components/RecordDetails'
import { statusStyles } from '../app/statuses'
import { roleLabels } from '../app/navigation'
import { message } from './useCatalog'

const categories = ['users', 'vehicles', 'services', 'history']
const labels = { users: 'Users', vehicles: 'Vehicles', services: 'Services', history: 'Historical Records' }
const searchLabels = {
  users: 'Search users by name, email, or role', vehicles: 'Search vehicle, plate, or customer',
  services: 'Search service name or type', history: 'Search vehicle, plate, customer or reference',
}
const date = value => value ? new Date(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' }) : '—'
const title = (item, category) => category === 'users' ? item.fullName
  : category === 'vehicles' ? `${item.make} ${item.model}` : category === 'services' ? item.name
    : `${item.vehicle?.make || 'Vehicle'} ${item.vehicle?.model || ''}`
const reference = (item, category) => category === 'users' ? item.employeeId || item.staffId || item.email
  : category === 'vehicles' ? item.plateNumber : category === 'services' ? item.type : item.vehicle?.plateNumber
const roleName = role => roleLabels[role] || role || 'Role unavailable'
const money = amount => `₱${Number(amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const archivedState = item => item.isArchived ? 'Archived' : 'Active'
const available = items => items.filter(([, value]) => value !== null && value !== undefined && value !== '')

function ArchiveIdentity({ item, category }) {
  const Icon = category === 'users' ? User : category === 'vehicles' || category === 'history' ? Car : Wrench
  const subline = category === 'users' ? item.employeeId || item.staffId || item.email
    : category === 'vehicles' || category === 'history' ? item.plateNumber || item.vehicle?.plateNumber
      : `${item.estimatedDuration || '—'} min · ${money(item.estimatedPrice)}`
  return <Box className="archive-identity">
    <span className="archive-identity-icon" aria-hidden="true"><Icon width={18} height={18} strokeWidth={1.7} /></span>
    <span className="archive-identity-copy"><strong>{title(item, category)}</strong><small>{subline || 'Reference unavailable'}</small></span>
  </Box>
}

function ArchiveDetailSections({ item, category }) {
  if (category === 'users') return <>
    <DetailGrid>
      <DetailSection title="User information"><DetailInfo items={available([
        ['Full name', item.fullName], ['Email', item.email], ['Phone', item.phone], ['Role', roleName(item.role)],
      ])} /></DetailSection>
      <DetailSection title="Archive information"><DetailInfo items={available([
        ['Archived date', item.archivedAt ? date(item.archivedAt) : null], ['Archived by', item.archivedBy?.fullName || item.archivedByRole],
        ['Reason', item.archiveReason], ['Last restored', item.restoredAt ? date(item.restoredAt) : null],
      ])} /></DetailSection>
    </DetailGrid>
    <DetailSection title="Account details"><DetailInfo items={available([
      ['Account status', item.status], ['Registered', item.createdAt ? date(item.createdAt) : null],
      ...(item.role === 'client' ? [['Archived vehicles', item.archivedVehicles ?? 0], ['Historical bookings', item.historicalCount ?? 0]] :
        item.role === 'mechanic' ? [['Completed jobs', item.historicalCount ?? 0]] : [['Processed bookings', item.historicalCount ?? 0]]),
    ])} /></DetailSection>
  </>
  if (category === 'vehicles') return <>
    <DetailGrid>
      <DetailSection title="Vehicle information"><DetailInfo items={available([
        ['Make and model', `${item.make || ''} ${item.model || ''}`.trim()], ['Year', item.year], ['Variant', item.variant],
        ['Plate', item.plateNumber], ['Current mileage', item.currentMileage == null ? null : `${item.currentMileage.toLocaleString()} km`],
      ])} /></DetailSection>
      <DetailSection title="Owner / customer"><DetailInfo items={available([
        ['Owner', item.owner?.fullName], ['Account status', item.owner?.isArchived ? 'Archived' : item.owner?.status],
        ['Completed services', item.historicalCount ?? 0],
      ])} /></DetailSection>
    </DetailGrid>
    <DetailSection title="Archive information"><DetailInfo items={available([
      ['Archived date', item.archivedAt ? date(item.archivedAt) : null], ['Archived by', item.archivedBy?.fullName || item.archivedByRole],
      ['Reason', item.archiveReason], ['Last restored', item.restoredAt ? date(item.restoredAt) : null],
    ])} /></DetailSection>
  </>
  return <>
    <DetailGrid>
      <DetailSection title="Service information"><DetailInfo items={available([
        ['Name', item.name], ['Type', item.type], ['Duration', item.estimatedDuration ? `${item.estimatedDuration} minutes` : null],
        ['Estimated price', money(item.estimatedPrice)], ['Reminder interval', item.maintenanceReminderInterval ? `${item.maintenanceReminderInterval} days` : null],
        ['Mileage interval', item.maintenanceIntervalKm ? `${item.maintenanceIntervalKm.toLocaleString()} km` : null],
      ])} /></DetailSection>
      <DetailSection title="Archive information"><DetailInfo items={available([
        ['Archived date', item.archivedAt ? date(item.archivedAt) : null], ['Archived by', item.archivedBy?.fullName || item.archivedByRole],
        ['Reason', item.archiveReason], ['Completed bookings', item.historicalCount ?? 0],
      ])} /></DetailSection>
    </DetailGrid>
    <DetailSection title="Description and checklist">
      <Typography sx={{ fontSize: 13, color: item.description ? 'text.primary' : 'text.secondary', whiteSpace: 'pre-wrap' }}>{item.description || 'No description recorded.'}</Typography>
      {item.checklistTemplate?.length > 0 && <Box className="archive-checklist">{item.checklistTemplate.map((entry, index) => <Typography key={`${entry}-${index}`}><span aria-hidden="true">○</span>{entry}</Typography>)}</Box>}
    </DetailSection>
  </>
}

export default function AdminArchive() {
  const [category, setCategory] = useState('users')
  const [scope, setScope] = useState('archived')
  const [role, setRole] = useState('all')
  const [search, setSearch] = useState('')
  const [pages, setPages] = useState({ users: 1, vehicles: 1, services: 1, history: 1 })
  const page = pages[category]
  const [revision, setRevision] = useState(0)
  const [data, setData] = useState({ items: [], totalPages: 0, totalItems: 0, loading: true, error: '' })
  const [selected, setSelected] = useState(null)
  const [selectedLoading, setSelectedLoading] = useState(false)
  const [action, setAction] = useState(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const requestKey = JSON.stringify([category, scope, role, search, page, revision])

  useEffect(() => {
    const controller = new AbortController()
    api.get(`/archive/${category}`, { signal: controller.signal,
      params: { ...(category === 'history' ? {} : { scope }), ...(category === 'users' && role !== 'all' ? { role } : {}),
        search, page, limit: 10 } })
      .then(({ data: result }) => { if (!controller.signal.aborted) {
        setData({ ...result, loading: false, error: '', requestKey: JSON.stringify([category, scope, role, search, result.page || page, revision]) })
        if (result.page && result.page !== page) setPages(current => ({ ...current, [category]: result.page }))
      } })
      .catch(error => { if (!controller.signal.aborted) setData({ items: [], totalPages: 0, totalItems: 0, loading: false, error: message(error), requestKey }) })
    return () => controller.abort()
  }, [category, scope, role, search, page, revision, requestKey])

  async function view(item) {
    setSelectedLoading(true)
    setSelected(null)
    setActionError('')
    try {
      const response = await api.get(`/archive/${category}/${item._id}`)
      setSelected(response.data.item)
    } catch (error) { setActionError(message(error)) }
    finally { setSelectedLoading(false) }
  }
  async function submit() {
    if (!action || busy) return
    setBusy(true)
    setActionError('')
    try {
      await api.post(`/archive/${category}/${action._id}/${action.isArchived ? 'restore' : 'archive'}`, { reason: reason.trim() })
      setNotice(`${title(action, category)} ${action.isArchived ? 'restored' : 'archived'}.`)
      setAction(null)
      setReason('')
      setSelected(null)
      setRevision(value => value + 1)
    } catch (error) { setActionError(message(error)) }
    finally { setBusy(false) }
  }
  const switchCategory = (_, value) => { setCategory(value); setSelected(null); setActionError('') }
  const setPage = value => setPages(current => ({ ...current, [category]: value }))
  const loading = data.loading || data.requestKey !== requestKey
  const pagination = { ...data, page, busy: loading, onPageChange: setPage }
  const hasSelection = Boolean(selected) || selectedLoading
  const status = selected && <MinimalStatus label={archivedState(selected)} status={selected.isArchived ? 'archived' : 'active'} />
  const detailAction = selected && !(category === 'services' && selected.isOtherService && !selected.isArchived)
    ? <Button onClick={() => { setAction(selected); setReason(''); setSelected(null) }}>{selected.isArchived ? 'Restore' : 'Archive'}</Button> : null
  const headers = category === 'users' ? ['User', 'Email', 'Role', 'Archived date', 'Status', 'Details', 'More']
    : category === 'vehicles' ? ['Vehicle', 'Owner / customer', 'Archived date', 'Status', 'Details', 'More']
      : category === 'services' ? ['Service', 'Type · duration · price', 'Archived date', 'Status', 'Details', 'More']
        : ['Vehicle', 'Customer', 'Services', 'Date', 'Status', 'Details']

  return <>
    <PageHeading title="Archive" subtitle="Manage inactive records and inspect retained history." preview={false} />
    {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
    {actionError && !action && <Alert severity="error" onClose={() => setActionError('')} sx={{ mb: 2 }}>{actionError}</Alert>}
    <RecordPanel className={`archive-workspace archive-${category} admin-list-surface`}>
      <Tabs className="archive-tabs" value={category} onChange={switchCategory} variant="scrollable" scrollButtons="auto">
        {categories.map(value => <Tab key={value} value={value} label={labels[value]} />)}
      </Tabs>
      <Box className="archive-toolbar admin-list-toolbar">
        <TextField className="archive-search" label={searchLabels[category]} size="small" value={search}
          onChange={event => { setSearch(event.target.value); setPages({ users: 1, vehicles: 1, services: 1, history: 1 }) }} slotProps={{ htmlInput: { maxLength: 100 } }} />
        {category !== 'history' && <TextField select size="small" label="Records" value={scope} onChange={event => {
          setScope(event.target.value)
          setPages(current => ({ ...current, users: 1, vehicles: 1, services: 1 }))
        }}>
          <MenuItem value="archived">Archived</MenuItem><MenuItem value="active">Active</MenuItem>
        </TextField>}
        {category === 'users' && <TextField select size="small" label="Role" value={role} onChange={event => { setRole(event.target.value); setPage(1) }}>
          <MenuItem value="all">All users</MenuItem><MenuItem value="client">Clients</MenuItem><MenuItem value="staff">Staff</MenuItem><MenuItem value="mechanic">Mechanics</MenuItem>
        </TextField>}
      </Box>
      {data.error && data.requestKey === requestKey && <Alert severity="error" sx={{ m: 2 }}>{data.error}</Alert>}
      <Box className="archive-table-header admin-list-header" aria-hidden="true">{headers.map(label => <span key={label}>{label}</span>)}</Box>
      <RecordList className="archive-list" items={data.items || []} pagination={pagination} selectionKey={`${category}-${scope}-${role}-${search}`}
        loading={loading && <Stack alignItems="center" sx={{ py: 5 }}><CircularProgress size={28} /></Stack>}
        empty={category === 'history' ? 'No historical records found.' : `No ${scope} ${labels[category].toLowerCase()} found.`}>
        {item => {
          const statusLabel = category === 'history' ? statusStyles[item.status]?.label || item.status : archivedState(item)
          const rowStatus = category === 'history' ? item.status : item.isArchived ? 'archived' : 'active'
          return <Box component="article" key={item._id} className="archive-row admin-list-row">
            <Box className="archive-cell archive-primary"><ArchiveIdentity item={item} category={category} /></Box>
            {category === 'users' && <>
              <Typography className="archive-cell archive-secondary">{item.email || 'Email unavailable'}</Typography>
              <Typography className="archive-cell archive-secondary">{roleName(item.role)}</Typography>
              <Typography className="archive-cell archive-secondary">{item.archivedAt ? date(item.archivedAt) : '—'}</Typography>
            </>}
            {category === 'vehicles' && <>
              <Typography className="archive-cell archive-secondary">{item.owner?.fullName || 'Owner unavailable'}</Typography>
              <Typography className="archive-cell archive-secondary">{item.archivedAt ? date(item.archivedAt) : '—'}</Typography>
            </>}
            {category === 'services' && <>
              <Typography className="archive-cell archive-secondary">{item.type || 'Type unavailable'} · {item.estimatedDuration || '—'} min · {money(item.estimatedPrice)}</Typography>
              <Typography className="archive-cell archive-secondary">{item.archivedAt ? date(item.archivedAt) : '—'}</Typography>
            </>}
            {category === 'history' && <>
              <Typography className="archive-cell archive-secondary">{item.client?.fullName || 'Customer unavailable'}</Typography>
              <Typography className="archive-cell archive-secondary" title={(item.services || []).map(service => service.name).join(', ')}>{(item.services || []).map(service => service.name).join(', ') || 'Services unavailable'}</Typography>
              <Typography className="archive-cell archive-secondary">{item.bookingDate || 'Date unavailable'}{item.bookingTime ? ` · ${item.bookingTime}` : ''}</Typography>
            </>}
            <Box className="archive-cell archive-state"><MinimalStatus label={statusLabel} status={rowStatus} /></Box>
            <Box className="archive-cell archive-details">
              {category === 'history' ? <Button className="admin-list-details" component={Link} to={`/admin/bookings?open=${item._id}`} endIcon={<NavArrowRight width={15} height={15} strokeWidth={1.7} />}>View booking</Button>
                : <Button className="admin-list-details" onClick={() => view(item)} endIcon={<NavArrowRight width={15} height={15} strokeWidth={1.7} />}>Details</Button>}
            </Box>
            {category !== 'history' && <Box className="archive-cell archive-more">
              {!(category === 'services' && item.isOtherService && !item.isArchived) && <MoreActionsMenu label={title(item, category)} items={[{ label: item.isArchived ? 'Restore' : 'Archive', onClick: () => { setAction(item); setReason(''); setActionError('') } }]} />}
            </Box>}
          </Box>
        }}
      </RecordList>
    </RecordPanel>
    <DetailDialog className="admin-archive-details-dialog" open={hasSelection} onClose={() => { setSelected(null); setSelectedLoading(false) }}
      title={selected?.isArchived ? 'Archived Record Details' : 'Record Details'} reference={selected && reference(selected, category)} status={status} actions={detailAction}>
      {selectedLoading ? <Stack alignItems="center" sx={{ py: 5 }}><CircularProgress size={28} /></Stack>
        : selected && <ArchiveDetailSections item={selected} category={category} />}
    </DetailDialog>
    <Dialog open={Boolean(action)} onClose={() => { if (!busy) setAction(null) }} fullWidth maxWidth="sm">
      <DialogTitle>{action?.isArchived ? 'Restore' : 'Archive'} {category === 'users' ? roleName(action?.role) : labels[category]?.slice(0, -1)}?</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        <Typography sx={{ fontWeight: 700 }}>{action && title(action, category)}</Typography>
        <Typography color="text.secondary">{action && reference(action, category)}</Typography>
        <Typography>{action?.isArchived ? 'This record will return to active use if its owner and configuration are valid.'
          : category === 'users' ? 'The account will no longer be able to sign in or receive new work. Historical records will remain available.'
            : 'The record will leave active selection. Historical records will remain available.'}</Typography>
        <TextField label="Reason (optional)" multiline minRows={2} value={reason} onChange={event => setReason(event.target.value)}
          slotProps={{ htmlInput: { maxLength: 300 } }} fullWidth />
        {actionError && <Alert severity="error">{actionError}</Alert>}
      </Stack></DialogContent><DialogActions><Button disabled={busy} onClick={() => setAction(null)}>Cancel</Button>
        <Button disabled={busy} variant="contained" onClick={submit}>{busy ? 'Saving…' : action?.isArchived ? 'Restore' : 'Archive'}</Button>
      </DialogActions>
    </Dialog>
  </>
}
