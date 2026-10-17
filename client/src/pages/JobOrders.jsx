import { useEffect, useState } from 'react'
import { Alert, Box, Button, CircularProgress, MenuItem, Stack, TextField, Typography } from '@mui/material'
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

export default function JobOrders({ role, view }) {
  const [searchParams] = useSearchParams()
  const openId = searchParams.get('open')
  const admin = role === 'admin'
  const monitoring = admin && !view
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [mechanic, setMechanic] = useState('all')
  const [mechanics, setMechanics] = useState([])
  const filters = useMemo(() => monitoring ? { search, status, mechanic } : {}, [monitoring, search, status, mechanic])
  const { items, loading, error, setError, reload, pagination } = useCatalog('/job-orders', filters, role !== 'mechanic' && view !== 'transactions')
  const visible = view === 'transactions' ? items.filter(job => ['final_inspection', 'ready_for_release', 'completed'].includes(job.booking?.status)) : items
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
    <PageHeading title={admin ? 'Service Monitoring' : view === 'transactions' ? 'Transactions' : role === 'staff' ? 'Job coordination' : 'My Jobs'} subtitle={admin ? 'Monitor assignments, progress, and completed work.' : view === 'transactions' ? 'Verify final payments and release fully paid vehicles.' : role === 'staff' ? 'Coordinate assignments and monitor service progress.' : 'Follow and update your assigned service visits.'} preview={false} />
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
    <RecordPanel className={`job-orders-workspace${monitoring ? ' service-monitoring-workspace admin-list-surface' : ''}`}>
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
      <RecordList className="job-orders-list" items={visible} pagination={pagination} selectionKey={view || role}
        loading={loading && <Stack alignItems="center" sx={{ py: 6 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 1 }}>Loading Job Orders…</Typography></Stack>}
        empty={view === 'transactions' ? 'No release or completed transactions yet.' : role !== 'mechanic' ? 'No Job Orders have been created.' : 'No jobs are assigned to you.'}>
          {job => <Box component="article" className={`service-monitoring-row${monitoring ? ' admin-list-row' : ''}`} key={job._id}>
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
