import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Pagination, Stack, Tab, Tabs, TextField, Typography } from '@mui/material'
import api from '../services/api'
import { PageHeading } from '../components/DashboardParts'
import RecordList, { RecordActions, RecordCard, RecordPanel } from '../components/RecordList'
import { DetailsButton, MoreActionsMenu } from '../components/RowActions'
import { StatusBadge } from '../components/StatusChip'
import { statusStyles } from '../app/statuses'
import { roleLabels } from '../app/navigation'
import { message } from './useCatalog'

const categories = ['users', 'vehicles', 'services', 'history']
const labels = { users: 'Users', vehicles: 'Vehicles', services: 'Services', history: 'Historical Records' }
const date = value => value ? new Date(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' }) : 'Not recorded'
const title = (item, category) => category === 'users' ? item.fullName
  : category === 'vehicles' ? `${item.make} ${item.model}` : category === 'services' ? item.name
    : `${item.vehicle?.make || 'Vehicle'} ${item.vehicle?.model || ''}`
const reference = (item, category) => category === 'users' ? item.employeeId || item.staffId || item.email
  : category === 'vehicles' ? item.plateNumber : category === 'services' ? item.description : item.vehicle?.plateNumber
const detailText = (item, category) => category === 'users'
  ? `${roleLabels[item.role] || item.role} · ${item.email || ''} · ${item.phone || 'No phone'}${item.role === 'client' ? ` · ${item.archivedVehicles || 0} archived vehicles` : ''}`
  : category === 'vehicles' ? `${item.plateNumber} · ${item.year} · Owner: ${item.owner?.fullName || 'Unavailable'}`
    : `${item.estimatedDuration || '—'} minutes · ₱${Number(item.estimatedPrice || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const countLabel = (category, item) => category === 'vehicles' ? 'completed services'
  : category === 'services' ? 'completed bookings' : item.role === 'mechanic' ? 'completed jobs' : 'historical bookings'

export default function AdminArchive() {
  const [category, setCategory] = useState('users')
  const [scope, setScope] = useState('archived')
  const [role, setRole] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [data, setData] = useState({ items: [], totalPages: 0, loading: true, error: '' })
  const [selected, setSelected] = useState(null)
  const [selectedLoading, setSelectedLoading] = useState(false)
  const [action, setAction] = useState(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    api.get(`/archive/${category}`, { signal: controller.signal,
      params: { ...(category === 'history' ? {} : { scope }), ...(category === 'users' && role !== 'all' ? { role } : {}),
        search, page, limit: 10 } })
      .then(({ data: result }) => { if (!controller.signal.aborted) setData({ ...result, loading: false, error: '' }) })
      .catch(error => { if (!controller.signal.aborted) setData({ items: [], totalPages: 0, loading: false, error: message(error) }) })
    return () => controller.abort()
  }, [category, scope, role, search, page, revision])

  async function view(item) {
    setSelectedLoading(true)
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
  const switchCategory = (_, value) => { setCategory(value); setPage(1); setSelected(null); setActionError('') }
  return <>
    <PageHeading title="Archive" subtitle="Manage inactive records and inspect retained history." preview={false} />
    {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
    {actionError && !action && <Alert severity="error" onClose={() => setActionError('')} sx={{ mb: 2 }}>{actionError}</Alert>}
    <RecordPanel>
      <Tabs value={category} onChange={switchCategory} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>
        {categories.map(value => <Tab key={value} value={value} label={labels[value]} />)}
      </Tabs>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2.5 }}>
        <TextField label="Search records" size="small" value={search} onChange={event => { setSearch(event.target.value); setPage(1) }}
          slotProps={{ htmlInput: { maxLength: 100 } }} sx={{ flex: 1 }} />
        {category !== 'history' && <TextField select size="small" label="Records" value={scope} onChange={event => { setScope(event.target.value); setPage(1) }} sx={{ minWidth: 145 }}>
          <MenuItem value="archived">Archived</MenuItem><MenuItem value="active">Active</MenuItem>
        </TextField>}
        {category === 'users' && <TextField select size="small" label="Role" value={role} onChange={event => { setRole(event.target.value); setPage(1) }} sx={{ minWidth: 145 }}>
          <MenuItem value="all">All users</MenuItem><MenuItem value="client">Clients</MenuItem><MenuItem value="staff">Staff</MenuItem><MenuItem value="mechanic">Mechanics</MenuItem>
        </TextField>}
      </Stack>
      {data.error && <Alert severity="error" sx={{ mb: 2 }}>{data.error}</Alert>}
      <RecordList items={data.items || []} selectionKey={`${category}-${scope}-${role}-${page}`}
        loading={data.loading && <Stack alignItems="center" sx={{ py: 5 }}><CircularProgress size={28} /></Stack>}
        empty={category === 'history' ? 'No historical bookings found.' : `No ${scope} ${labels[category].toLowerCase()} found.`}>
        {item => <RecordCard key={item._id} entityType={category === 'vehicles' ? 'vehicle' : 'service'}>
          <Box className="record-card-copy">
            <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{title(item, category)}</Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{reference(item, category)}{category === 'users' ? ` · ${roleLabels[item.role] || item.role}` : ''}</Typography>
            {category === 'history' ? <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{item.client?.fullName || 'Client unavailable'} · {item.bookingDate} · {(item.services || []).map(service => service.name).join(', ')}</Typography>
              : <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{item.historicalCount || 0} {countLabel(category, item)}{item.isArchived ? ` · Archived ${date(item.archivedAt)} · ${item.archiveReason || 'No reason supplied'} · By ${item.archivedBy?.fullName || 'Legacy archive'}` : ''}</Typography>}
          </Box>
          <RecordActions statuses={<StatusBadge label={category === 'history' ? statusStyles[item.status]?.label || item.status : item.isArchived ? 'Archived' : 'Active'} />}>
            {category === 'history' ? <Button size="small" component={Link} to={`/admin/bookings?open=${item._id}`}>View booking</Button> : <>
              <DetailsButton onClick={() => view(item)}>View</DetailsButton>
              {!(category === 'services' && item.isOtherService && !item.isArchived) && <MoreActionsMenu label={title(item, category)} items={[{ label: item.isArchived ? 'Restore' : 'Archive', onClick: () => { setAction(item); setReason(''); setActionError('') } }]} />}
            </>}
          </RecordActions>
        </RecordCard>}
      </RecordList>
      {data.totalPages > 1 && <Stack alignItems="center" sx={{ pt: 2 }}><Pagination count={data.totalPages} page={Math.min(page, data.totalPages)} onChange={(_, value) => setPage(value)} /></Stack>}
    </RecordPanel>
    <Dialog open={Boolean(selected) || selectedLoading} onClose={() => setSelected(null)} fullWidth maxWidth="sm">
      <DialogTitle>Record details</DialogTitle><DialogContent>
        {selectedLoading ? <CircularProgress size={24} /> : selected && <Stack spacing={1.5} sx={{ pt: 1 }}>
          <Typography variant="h6">{title(selected, category)}</Typography>
          <Typography>{reference(selected, category)}</Typography>
          <Typography sx={{ textTransform: 'capitalize' }}>{detailText(selected, category)}</Typography>
          <Typography>{selected.historicalCount || 0} {countLabel(category, selected)}</Typography>
          <Typography>State: {selected.isArchived ? 'Archived' : 'Active'}</Typography>
          {selected.archivedAt && <Typography>Archived: {date(selected.archivedAt)} by {selected.archivedBy?.fullName || 'Legacy archive'}</Typography>}
          {selected.archiveReason && <Typography>Reason: {selected.archiveReason}</Typography>}
          {selected.restoredAt && <Typography>Last restored: {date(selected.restoredAt)} by {selected.restoredBy?.fullName || 'Unknown'}</Typography>}
          {(selected.archiveActivity || []).length > 0 && <Box><Typography sx={{ fontWeight: 700, mb: 1 }}>Archive activity</Typography>
            {selected.archiveActivity.map((entry, index) => <Typography key={entry._id || index} sx={{ fontSize: 13, mb: .5 }}>
              {date(entry.timestamp)} · {entry.action} by {entry.actor?.fullName || entry.actorRole}{entry.reason ? ` · ${entry.reason}` : ''}
            </Typography>)}</Box>}
        </Stack>}
      </DialogContent><DialogActions><Button onClick={() => setSelected(null)}>Close</Button>
        {selected && <Button onClick={() => { setAction(selected); setReason(''); setSelected(null) }}>{selected.isArchived ? 'Restore' : 'Archive'}</Button>}
      </DialogActions>
    </Dialog>
    <Dialog open={Boolean(action)} onClose={() => { if (!busy) setAction(null) }} fullWidth maxWidth="sm">
      <DialogTitle>{action?.isArchived ? 'Restore' : 'Archive'} {category === 'users' ? roleLabels[action?.role] || action?.role : labels[category]?.slice(0, -1)}?</DialogTitle>
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
