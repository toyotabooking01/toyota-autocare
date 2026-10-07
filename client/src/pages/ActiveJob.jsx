import { useEffect, useState } from 'react'
import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography } from '@mui/material'
import { PageHeading } from '../components/DashboardParts'
import api from '../services/api'
import { message } from './useCatalog'
import JobOrderPanel from './JobOrderPanel'

export default function ActiveJob() {
  const [job, setJob] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    api.get('/job-orders/active', { signal: controller.signal })
      .then(response => { setJob(response.data.item); setError('') })
      .catch(requestError => { if (!controller.signal.aborted) setError(message(requestError)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [revision])
  return <>
    <PageHeading title="Active Job" subtitle="Your current assigned service visit." preview={false} />
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderColor: '#e5eaf1', borderRadius: 2.5, maxWidth: 850 }}>
      {loading ? <Stack alignItems="center" sx={{ py: 6 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 1 }}>Loading active job…</Typography></Stack>
        : error ? <Stack spacing={2} alignItems="flex-start" sx={{ py: 5 }}><Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Your active job could not be loaded.</Typography><Button variant="outlined" onClick={() => { setLoading(true); setRevision(value => value + 1) }}>Retry loading</Button></Stack>
        : !job ? <Typography sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>No active job is assigned to you.</Typography>
          : <Box><JobOrderPanel key={`${job._id}-${job.updatedAt}`} job={job} role="mechanic" onChanged={(item, result) => { setJob(item); setNotice(result) }} /></Box>}
    </Paper>
  </>
}
