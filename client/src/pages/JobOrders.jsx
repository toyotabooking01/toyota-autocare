import { useState } from 'react'
import { Alert, Box, CircularProgress, Stack, Typography } from '@mui/material'
import { DetailDialog } from '../components/RecordDetails'
import { DetailsButton } from '../components/RowActions'
import StatusChip from '../components/StatusChip'
import { PageHeading } from '../components/DashboardParts'
import useCatalog from './useCatalog'
import RecordList, { RecordCard, RecordActions, RecordPanel } from '../components/RecordList'
import { dateLabel } from './bookingDisplay'
import JobOrderPanel from './JobOrderPanel'
import { vehicleName } from './jobOrderDisplay'

export default function JobOrders({ role, view }) {
  const admin = role === 'admin'
  const { items, loading, error, setError, reload, pagination } = useCatalog('/job-orders', {}, role !== 'mechanic' && view !== 'transactions')
  const visible = view === 'transactions' ? items.filter(job => ['final_inspection', 'ready_for_release', 'completed'].includes(job.booking?.status)) : items
  const [selected, setSelected] = useState(null)
  const [notice, setNotice] = useState('')
  function changed(job, result) { setSelected(job); setNotice(result); reload() }
  return <>
    <PageHeading title={admin ? 'Service monitoring' : view === 'transactions' ? 'Transactions' : role === 'staff' ? 'Job coordination' : 'My Jobs'} subtitle={admin ? 'Monitor assignments, progress, and completed work.' : view === 'transactions' ? 'Prepare vehicle release and review completed services. Payment recording is not configured.' : role === 'staff' ? 'Coordinate assignments and monitor service progress.' : 'Follow and update your assigned service visits.'} preview={false} />
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
    <RecordPanel className="job-orders-workspace">
      <RecordList items={visible} pagination={pagination} selectionKey={view || role}
        loading={loading && <Stack alignItems="center" sx={{ py: 6 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 1 }}>Loading Job Orders…</Typography></Stack>}
        empty={view === 'transactions' ? 'No release or completed transactions yet.' : role !== 'mechanic' ? 'No Job Orders have been created.' : 'No jobs are assigned to you.'}>
          {job => <RecordCard key={job._id} entityType={view === 'transactions' ? 'transaction' : 'vehicle'}>
            <Box className="record-card-copy"><Typography sx={{ fontWeight: 650, fontSize: 14 }}>{vehicleName(job.booking?.vehicle)}</Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', overflowWrap: 'anywhere' }}>{job.booking ? `${dateLabel(job.booking.bookingDate)} · ${job.booking.bookingTime}` : 'Booking unavailable'} · {job._id}</Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{(job.booking?.services || []).map(service => service?.name).filter(Boolean).join(', ') || 'Service unavailable'} · {role !== 'mechanic' ? `${job.mechanic?.fullName || 'Mechanic unavailable'} · ` : ''}{job.serviceBay?.name || 'Bay unavailable'}</Typography>
            </Box><RecordActions statuses={<StatusChip status={job.booking?.status} />}><DetailsButton onClick={() => setSelected(job)}>Details</DetailsButton></RecordActions>
          </RecordCard>}
      </RecordList>
    </RecordPanel>
    <DetailDialog id="job-details-title" open={Boolean(selected)} onClose={() => setSelected(null)} title={view === 'transactions' ? 'Transaction details' : 'Job Order details'}
      reference={selected && `Job Order ${selected._id}`} status={selected && <StatusChip status={selected.booking?.status} />}>
      {selected && <JobOrderPanel key={`${selected._id}-${selected.updatedAt}`} job={selected} role={role} onChanged={changed} showHeader={false} />}
    </DetailDialog>
  </>
}
