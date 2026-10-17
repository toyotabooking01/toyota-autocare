import { useEffect, useState } from 'react'
import { Alert, Box, Button, CircularProgress, InputAdornment, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { DetailDialog } from '../components/RecordDetails'
import StatusChip, { MinimalStatus } from '../components/StatusChip'
import { PageHeading } from '../components/DashboardParts'
import useCatalog from './useCatalog'
import RecordList, { RecordPanel } from '../components/RecordList'
import { dateLabel } from './bookingDisplay'
import JobOrderPanel from './JobOrderPanel'
import { vehicleName } from './jobOrderDisplay'
import { useSearchParams } from 'react-router-dom'
import api from '../services/api'
import { useMemo } from 'react'
import { NavArrowRight } from 'iconoir-react'
import SearchRounded from '@mui/icons-material/SearchRounded'

export default function JobOrders({ role, view }) {
  const [searchParams] = useSearchParams()
  const openId = searchParams.get('open')
  const admin = role === 'admin'
  const monitoring = admin && !view
  const mechanicList = role === 'mechanic' && !view
  const staffList = role === 'staff' && !view
  const transactionList = role === 'staff' && view === 'transactions'
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState(() => searchParams.get('status') || 'all')
  const [dateOrder, setDateOrder] = useState('newest')
  const [mechanic, setMechanic] = useState('all')
  const [mechanics, setMechanics] = useState([])
  const filters = useMemo(() => monitoring ? { search, status, mechanic } : staffList || transactionList ? { search, status } : {}, [monitoring, search, status, mechanic, staffList, transactionList])
  const { items, loading, error, setError, reload, pagination } = useCatalog('/job-orders', filters, role !== 'mechanic')
  const visible = view === 'transactions' ? items.filter(job => ['final_inspection', 'ready_for_release', 'completed'].includes(job.booking?.status)) : items
  const mechanicJobs = useMemo(() => {
    if (!mechanicList) return visible
    const term = search.trim().toLocaleLowerCase()
    return visible.filter(job => {
      const jobStatus = job.booking?.status || job.status
      if (status !== 'all' && jobStatus !== status) return false
      if (!term) return true
      const vehicle = job.booking?.vehicle
      const searchable = [vehicle?.make, vehicle?.model, vehicle?.year, vehicle?.plateNumber, job._id,
        ...(job.booking?.services || []).map(service => service?.name)].filter(Boolean).join(' ').toLocaleLowerCase()
      return searchable.includes(term)
    }).sort((first, second) => {
      const schedule = job => `${job.booking?.bookingDate || ''}T${job.booking?.bookingTime || ''}`
      const comparison = schedule(second).localeCompare(schedule(first)) || String(second.createdAt || '').localeCompare(String(first.createdAt || ''))
      return dateOrder === 'newest' ? comparison : -comparison
    })
  }, [dateOrder, mechanicList, search, status, visible])
  const [selected, setSelected] = useState(null)
  useEffect(() => {
    if (!monitoring) return undefined
    const controller = new AbortController()
    api.get('/mechanics', { params: { archive: 'all', limit: 50 }, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setMechanics(data.items || []) })
      .catch(() => { if (!controller.signal.aborted) setMechanics([]) })
    return () => controller.abort()
  }, [monitoring])
  useEffect(() => {
    if (!/^[a-f\d]{24}$/i.test(openId || '')) return undefined
    const controller = new AbortController()
    api.get(`/job-orders/${openId}`, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setSelected(data.item) })
      .catch(() => { if (!controller.signal.aborted) setError('Job Order details could not be loaded.') })
    return () => controller.abort()
  }, [openId, setError])
  const [notice, setNotice] = useState('')
  function changed(job, result) { setSelected(job); setNotice(result); reload() }
  return <>
    <PageHeading title={admin ? 'Service Monitoring' : view === 'transactions' ? 'Transactions' : role === 'staff' ? 'Job Coordination' : 'My Jobs'} subtitle={admin ? 'Monitor assignments, progress, and completed work.' : view === 'transactions' ? 'Verify final payments and release fully paid vehicles.' : role === 'staff' ? 'Coordinate assignments and monitor service progress.' : 'Follow and update your assigned service visits.'} preview={false} />
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
    <RecordPanel className={`job-orders-workspace${monitoring ? ' service-monitoring-workspace admin-list-surface' : ''}${mechanicList ? ' mechanic-jobs-workspace admin-list-surface' : ''}${staffList || transactionList ? ' staff-job-orders-workspace admin-list-surface' : ''}`}>
      {(staffList || transactionList) && <Box className="admin-list-toolbar staff-jobs-toolbar">
        <TextField size="small" label={transactionList ? 'Search reference, vehicle, or customer' : 'Search vehicle, plate, or customer'} value={search} onChange={event => setSearch(event.target.value)} slotProps={{ htmlInput: { maxLength: 100, 'aria-label': transactionList ? 'Search reference, vehicle, or customer' : 'Search vehicle, plate, or customer' } }} />
        <TextField select size="small" label="Status" value={status} onChange={event => setStatus(event.target.value)}>
          <MenuItem value="all">All statuses</MenuItem><MenuItem value="mechanic_assigned">Mechanic Assigned</MenuItem><MenuItem value="in_service">In Service</MenuItem><MenuItem value="final_inspection">Final Inspection</MenuItem><MenuItem value="ready_for_release">Ready for Release</MenuItem><MenuItem value="completed">Completed</MenuItem>
        </TextField>
      </Box>}
      {mechanicList && <Box className="admin-list-toolbar mechanic-jobs-toolbar">
        <TextField className="mechanic-jobs-search" size="small" placeholder="Search vehicle, plate number, or job..." value={search}
          onChange={event => setSearch(event.target.value)} slotProps={{ htmlInput: { maxLength: 100, 'aria-label': 'Search vehicle, plate number, or job' }, input: { startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> } }} />
        <TextField className="mechanic-jobs-status" select size="small" label="Status" value={status} onChange={event => setStatus(event.target.value)}>
          <MenuItem value="all">All statuses</MenuItem><MenuItem value="mechanic_assigned">Assigned</MenuItem><MenuItem value="checked_in">Checked In</MenuItem>
          <MenuItem value="in_service">In Service</MenuItem><MenuItem value="final_inspection">Final Inspection</MenuItem><MenuItem value="ready_for_release">Ready for Release</MenuItem><MenuItem value="completed">Completed</MenuItem>
        </TextField>
        <TextField className="mechanic-jobs-order" select size="small" label="Date order" value={dateOrder} onChange={event => setDateOrder(event.target.value)}>
          <MenuItem value="newest">Newest first</MenuItem><MenuItem value="oldest">Oldest first</MenuItem>
        </TextField>
      </Box>}
      {monitoring && <Box className="service-monitoring-toolbar admin-list-toolbar">
        <TextField size="small" label="Search vehicle, plate, customer or reference" value={search} onChange={event => setSearch(event.target.value)} slotProps={{ htmlInput: { maxLength: 100 } }} />
        <TextField select size="small" label="Status" value={status} onChange={event => setStatus(event.target.value)}>
          <MenuItem value="all">All statuses</MenuItem><MenuItem value="mechanic_assigned">Mechanic Assigned</MenuItem><MenuItem value="in_service">In Service</MenuItem><MenuItem value="final_inspection">Final Inspection</MenuItem><MenuItem value="ready_for_release">Ready for Release</MenuItem><MenuItem value="completed">Completed</MenuItem>
        </TextField>
        <TextField select size="small" label="Mechanic" value={mechanic} onChange={event => setMechanic(event.target.value)}>
          <MenuItem value="all">All mechanics</MenuItem>{mechanics.map(item => <MenuItem key={item._id} value={item._id}>{item.fullName}</MenuItem>)}
        </TextField>
      </Box>}
      {monitoring && <Box className="service-monitoring-header admin-list-header" aria-hidden="true"><span>Vehicle / Job</span><span>Service</span><span>Mechanic / Bay</span><span>Status</span><span>Details</span></Box>}
      {mechanicList && <Box className="mechanic-job-header admin-list-header" aria-hidden="true"><span>Vehicle / Job</span><span>Service</span><span>Schedule / Bay</span><span>Status</span><span>Details</span></Box>}
      {(staffList || transactionList) && <Box className={`staff-job-header admin-list-header${transactionList ? ' staff-transaction-header' : ''}`} aria-hidden="true">{transactionList ? <><span>Reference</span><span>Vehicle</span><span>Customer</span><span>Amount</span><span>Type</span><span>Status</span><span>Action</span></> : <><span>Vehicle / Job Order</span><span>Customer</span><span>Service</span><span>Bay</span><span>Status</span><span>Action</span></>}</Box>}
      <RecordList className={`job-orders-list${mechanicList ? ' mechanic-jobs-list' : ''}${staffList || transactionList ? ` staff-jobs-list${transactionList ? ' staff-transactions-list' : ''}` : ''}`} items={mechanicList ? mechanicJobs : visible} pagination={pagination} selectionKey={mechanicList ? `${search}|${status}|${dateOrder}` : `${view || role}|${search}|${status}`}
        loading={loading && <Stack alignItems="center" sx={{ py: 6 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 1 }}>Loading Job Orders…</Typography></Stack>}
        empty={view === 'transactions' ? 'No release or completed transactions yet.' : role !== 'mechanic' ? 'No Job Orders have been created.' : 'No jobs are assigned to you.'}>
          {job => (staffList || transactionList) ? transactionList ? <Box component="article" className="staff-job-row staff-transaction-row admin-list-row" key={job._id}>
            <Typography className="staff-job-reference" title={job.booking?.bookingReference || job.booking?._id}>{job.booking?.bookingReference || `BK-${String(job.booking?._id || job._id).slice(-8).toUpperCase()}`}</Typography>
            <Typography className="staff-job-vehicle">{vehicleName(job.booking?.vehicle)}</Typography>
            <Typography className="staff-job-customer">{job.booking?.client?.fullName || 'Customer unavailable'}</Typography>
            <Typography className="staff-job-amount">{Number.isSafeInteger(job.booking?.finalTotalCents) ? `₱${(job.booking.finalTotalCents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—'}</Typography>
            <Typography className="staff-job-type">{job.booking?.bookingType === 'walk-in' ? 'Walk-In' : 'Online'}</Typography>
            <MinimalStatus label={job.booking?.status?.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()) || 'Status unavailable'} status={job.booking?.status || job.status} />
            <Button className="admin-list-details" variant="text" onClick={() => setSelected(job)}>Details<NavArrowRight width={16} height={16} strokeWidth={1.7} aria-hidden="true" /></Button>
          </Box> : <Box component="article" className="staff-job-row admin-list-row" key={job._id}>
            <Box className="staff-job-identity"><Typography>{vehicleName(job.booking?.vehicle)}</Typography><Typography>Job Order {String(job._id).slice(-8).toUpperCase()}</Typography></Box>
            <Typography className="staff-job-customer">{job.booking?.client?.fullName || 'Customer unavailable'}</Typography>
            <Typography className="staff-job-service">{(job.booking?.services || []).map(service => service?.name).filter(Boolean).join(', ') || 'Service unavailable'}</Typography>
            <Typography className="staff-job-bay">{job.serviceBay?.name || 'Bay unavailable'}</Typography>
            <MinimalStatus label={job.booking?.status?.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()) || 'Status unavailable'} status={job.booking?.status || job.status} />
            <Button className="admin-list-details" variant="text" onClick={() => setSelected(job)}>Details<NavArrowRight width={16} height={16} strokeWidth={1.7} aria-hidden="true" /></Button>
          </Box> : mechanicList ? <Box component="article" className="mechanic-job-row admin-list-row" key={job._id}>
            <Box className="mechanic-job-vehicle"><Typography className="mechanic-job-primary">{vehicleName(job.booking?.vehicle).split(' · ')[0]}</Typography>
              <Typography>{job.booking?.vehicle?.plateNumber || 'Plate unavailable'}</Typography><Typography className="mechanic-job-reference">{job._id}</Typography></Box>
            <Typography className="mechanic-job-service" title={(job.booking?.services || []).map(service => service?.name).filter(Boolean).join(', ')}>{(job.booking?.services || []).map(service => service?.name).filter(Boolean).join(', ') || 'Service unavailable'}</Typography>
            <Box className="mechanic-job-schedule"><Typography>{job.booking ? `${dateLabel(job.booking.bookingDate)} · ${job.booking.bookingTime}` : 'Booking unavailable'}</Typography><Typography>{job.serviceBay?.name || 'Bay unavailable'}</Typography></Box>
            <Box className="mechanic-job-status"><StatusChip minimal status={job.booking?.status || job.status} /></Box>
            <Button className="service-monitoring-details admin-list-details mechanic-job-details" endIcon={<NavArrowRight width={16} height={16} strokeWidth={1.7} />} onClick={() => setSelected(job)}>Details</Button>
          </Box> : <Box component="article" className={`service-monitoring-row${monitoring ? ' admin-list-row' : ''}`} key={job._id}>
            <Box className="service-monitoring-copy"><Typography className="service-monitoring-vehicle">{vehicleName(job.booking?.vehicle)}</Typography>
              <Typography className="service-monitoring-reference">{job.booking ? `${dateLabel(job.booking.bookingDate)} · ${job.booking.bookingTime}` : 'Booking unavailable'} · {job._id}</Typography>
              {!monitoring && <Typography className="service-monitoring-meta">{(job.booking?.services || []).map(service => service?.name).filter(Boolean).join(', ') || 'Service unavailable'} · {job.mechanic?.fullName || 'Mechanic unavailable'} · {job.serviceBay?.name || 'Bay unavailable'}</Typography>}
            </Box>
            {monitoring && <Typography className="service-monitoring-service" title={(job.booking?.services || []).map(service => service?.name).filter(Boolean).join(', ')}>{(job.booking?.services || []).map(service => service?.name).filter(Boolean).join(', ') || 'Service unavailable'}</Typography>}
            {monitoring && <Box className="service-monitoring-assignment"><Typography>{job.mechanic?.fullName || 'Mechanic unavailable'}</Typography><Typography>{job.serviceBay?.name || 'Bay unavailable'}</Typography></Box>}
            <Box className="service-monitoring-status"><StatusChip minimal status={job.booking?.status || job.status} /></Box>
            <Button className={`service-monitoring-details${monitoring ? ' admin-list-details' : ''}`} endIcon={<NavArrowRight width={16} height={16} strokeWidth={1.7} />} onClick={() => setSelected(job)}>Details</Button>
            {!monitoring && <span className="service-monitoring-more" aria-hidden="true" />}
          </Box>}
      </RecordList>
    </RecordPanel>
    <DetailDialog className="job-order-details-dialog" id="job-details-title" open={Boolean(selected)} onClose={() => setSelected(null)} title="Job Order Details"
      reference={selected && `Job Order ${selected._id}`} status={selected && <MinimalStatus label={selected.booking?.status?.replaceAll('_', ' ').replace(/^\w/, letter => letter.toUpperCase()) || selected.status} status={selected.booking?.status || selected.status} />}>
      {selected && <JobOrderPanel key={`${selected._id}-${selected.updatedAt}`} job={selected} role={role} onChanged={changed} showHeader={false} compact />}
    </DetailDialog>
  </>
}
