import { useState } from 'react'
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Typography } from '@mui/material'
import StatusChip from '../components/StatusChip'
import { PageHeading } from '../components/DashboardParts'
import useCatalog from './useCatalog'
import { dateLabel } from './bookingDisplay'
import JobOrderPanel from './JobOrderPanel'
import { vehicleName } from './jobOrderDisplay'

export default function JobOrders({ role }) {
  const admin = role === 'admin'
  const { items, loading, error, setError, reload } = useCatalog('/job-orders', {})
  const [selected, setSelected] = useState(null)
  const [notice, setNotice] = useState('')
  function changed(job, result) { setSelected(job); setNotice(result); reload() }
  return <>
    <PageHeading title={admin ? 'Job Orders' : 'My Jobs'} subtitle={admin ? 'Manage inspection and release decisions.' : 'Follow and update your assigned service visits.'} preview={false} />
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderColor: '#e5eaf1', borderRadius: 2.5 }}>
      {loading ? <Stack alignItems="center" sx={{ py: 6 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 1 }}>Loading Job Orders…</Typography></Stack>
        : !items.length ? <Typography sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>{admin ? 'No Job Orders have been created.' : 'No jobs are assigned to you.'}</Typography>
          : <Stack spacing={1}>{items.map(job => <Box key={job._id} sx={{ p: 2, border: '1px solid #e9edf2', borderRadius: 2, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' }, gap: 2, minWidth: 0 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}><Typography sx={{ fontWeight: 650, fontSize: 14 }}>{vehicleName(job.booking?.vehicle)}</Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', overflowWrap: 'anywhere' }}>{job.booking ? `${dateLabel(job.booking.bookingDate)} · ${job.booking.bookingTime}` : 'Booking unavailable'} · {job._id}</Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{admin ? `${job.mechanic?.fullName || 'Mechanic unavailable'} · ` : ''}{job.serviceBay?.name || 'Bay unavailable'}</Typography>
            </Box><Stack direction="row" alignItems="center" spacing={1}><StatusChip status={job.booking?.status} /><Button size="small" variant="outlined" onClick={() => setSelected(job)}>Details</Button></Stack>
          </Box>)}</Stack>}
    </Paper>
    <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="sm" aria-labelledby="job-details-title">
      <DialogTitle id="job-details-title">Job Order details</DialogTitle><DialogContent>{selected && <Box sx={{ pt: 1 }}><JobOrderPanel key={`${selected._id}-${selected.updatedAt}`} job={selected} role={role} onChanged={changed} /></Box>}</DialogContent>
      <DialogActions sx={{ p: 2 }}><Button onClick={() => setSelected(null)}>Close</Button></DialogActions>
    </Dialog>
  </>
}
