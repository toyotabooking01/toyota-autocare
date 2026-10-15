import useFormValidation from '../components/useFormValidation'
import { useEffect, useState } from 'react'
import { Alert, Box, Button, CircularProgress, Paper, Stack, TextField, Typography } from '@mui/material'
import api from '../services/api'
import { PageHeading, MetricCards, Panel } from '../components/DashboardParts'
import StatusChip from '../components/StatusChip'
import { money } from './bookingDisplay'
import { manilaToday } from './dashboardData'
import { friendlyError } from '../utils/friendlyErrors'
import RecordList, { RecordCard, RecordActions } from '../components/RecordList'

const today = manilaToday()
const start = new Date(`${today}T00:00:00.000Z`)
start.setUTCDate(start.getUTCDate() - 29)
const initialRange = { from: start.toISOString().slice(0, 10), to: today }
const textStyle = { fontSize: 12, color: 'text.secondary' }
function SmallRows({ items, primary, secondary, empty, entityType = 'service' }) {
  return <RecordList items={items} empty={empty}>{item => <RecordCard key={item.id || item.date} entityType={entityType} entityName={entityType === 'account' ? primary(item) : undefined}>
    <Box className="record-card-copy"><Typography>{primary(item)}</Typography><Typography>{secondary(item)}</Typography></Box>
  </RecordCard>}</RecordList>
}
export default function AdminReports() {
  const [draft, setDraft] = useState(initialRange)
  const [range, setRange] = useState(initialRange)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const validation = useFormValidation('report', draft)
  useEffect(() => {
    const controller = new AbortController()
    api.get('/reports/summary', { params: range, signal: controller.signal })
      .then(response => { setReport(response.data); setError('') })
      .catch(requestError => { if (!controller.signal.aborted) { setReport(null); setError(friendlyError(requestError)) } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [range])
  function apply(event) {
    event.preventDefault()
    if (!validation.validate()) return
    setLoading(true); setRange({ ...draft })
  }
  const cards = report ? [
    { label: 'Bookings', value: report.totalBookings, detail: 'Visits in range', tone: 'blue' },
    { label: 'Completed visits', value: report.completedBookings, detail: `${report.completedServices} service selections`, tone: 'green' },
    { label: 'Online', value: report.bySource.online, detail: 'Online bookings', tone: 'purple' },
    { label: 'Walk-In', value: report.bySource['walk-in'], detail: 'Front-desk bookings', tone: 'amber' },
  ] : []
  return <>
    <PageHeading title="Reports" subtitle="Operational summaries from existing service records." preview={false} />
    <Paper component="form" noValidate onSubmit={apply} variant="outlined" sx={{ p: 2, mb: 2.5, borderColor: 'var(--line)', borderRadius: 2.5 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
        <TextField label="From" type="date" size="small" required value={draft.from} {...validation.field('from')} onChange={event => setDraft(current => ({ ...current, from: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField label="To" type="date" size="small" required value={draft.to} {...validation.field('to')} onChange={event => setDraft(current => ({ ...current, to: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }} />
        <Button type="submit" variant="contained" disabled={loading}>Apply range</Button>
        <Typography sx={textStyle}>Filtered by scheduled visit date. Maximum 367 days.</Typography>
      </Stack>
    </Paper>
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {loading ? <Stack alignItems="center" sx={{ py: 8 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 1 }}>Loading reports…</Typography></Stack>
      : report && <>
        <MetricCards items={cards} />
        <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5, borderColor: 'var(--line)', borderRadius: 2.5 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700 }}>Completed service estimate</Typography>
          <Typography sx={{ fontSize: 25, fontWeight: 750, color: 'primary.main', mt: .5 }}>{money(report.completedEstimate)}</Typography>
          <Typography sx={textStyle}>Sum of current Service catalog prices for completed visits in this range. This is an estimate, not payment or historical revenue.</Typography>
        </Paper>
        {!report.totalBookings ? <Alert severity="info">No bookings fall within this date range.</Alert> : <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2.5, mb: 2.5 }}>
            <Panel title="Bookings by status"><RecordList items={Object.entries(report.byStatus).filter(([, count]) => count)}>{([status, count]) => <RecordCard key={status}><Box className="record-card-copy"><Typography sx={{ fontSize: 14, fontWeight: 650 }}>{count} bookings</Typography></Box><RecordActions statuses={<StatusChip status={status} />} /></RecordCard>}</RecordList></Panel>
            <Panel title="Bookings by date"><SmallRows entityType="schedule" items={report.bookingsByDate} primary={item => item.date} secondary={item => `${item.bookings} booked · ${item.completed} completed`} empty="No dated bookings." /></Panel>
            <Panel title="Service popularity"><SmallRows items={report.servicePopularity} primary={item => item.name} secondary={item => `${item.bookings} selected · ${item.completed} completed`} empty="No services selected." /></Panel>
            <Panel title="Mechanic workload"><SmallRows entityType="account" items={report.mechanicWorkload} primary={item => item.name} secondary={item => `${item.assigned} assigned · ${item.active} active · ${item.completed} completed`} empty="No mechanic assignments in range." /></Panel>
            <Panel title="Staff activity"><SmallRows entityType="account" items={report.staffActivity || []} primary={item => item.name} secondary={item => `${item.processed} bookings last processed`} empty="No staff processed bookings in range." /></Panel>
            <Panel title="Service Bay usage"><SmallRows entityType="bay" items={report.serviceBayUsage} primary={item => item.name} secondary={item => `${item.visits} visits · ${item.active} active · ${item.completed} completed`} empty="No bay assignments in range." /></Panel>
          </Box>
        </>}
      </>}
  </>
}
