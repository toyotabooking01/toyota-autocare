import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Box, Button, CircularProgress, MenuItem, Paper, Stack, Tab, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Tabs, TextField, Typography } from '@mui/material'
import useFormValidation from '../components/useFormValidation'
import api from '../services/api'
import { PageHeading } from '../components/DashboardParts'
import { manilaToday } from './dashboardData'
import { friendlyError } from '../utils/friendlyErrors'
import { formatPaymentMethod } from '../utils/paymentMethod'

const today = manilaToday()
const initialRange = { from: `${today.slice(0, 7)}-01`, to: today }
const tabs = ['Overview', 'Bookings', 'Revenue', 'Services', 'Mechanics', 'Additional Work', 'Maintenance']
const pesos = cents => `₱${((cents || 0) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const date = value => value ? new Date(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric' }) : '—'
const label = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase())
const box = { p: 2, border: '1px solid var(--line)', borderRadius: 2.5, bgcolor: 'var(--surface)', minWidth: 0 }
const muted = { fontSize: 12, color: 'text.secondary' }

function Kpis({ items }) {
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
    {items.map(item => <Box key={item.label} sx={box}><Typography sx={muted}>{item.label}</Typography>
      <Typography sx={{ fontSize: 23, fontWeight: 700, mt: .5 }}>{item.value}</Typography>
      {item.note && <Typography sx={muted}>{item.note}</Typography>}
    </Box>)}
  </Box>
}
function Section({ title, caption, children }) {
  return <Box sx={box}><Typography component="h2" sx={{ fontSize: 15, fontWeight: 700 }}>{title}</Typography>
    {caption && <Typography sx={{ ...muted, mb: 1.5 }}>{caption}</Typography>}{children}</Box>
}
function ReportTable({ columns, rows, empty = 'No report data for this period.' }) {
  if (!rows?.length) return <Typography sx={{ ...muted, py: 2 }}>{empty}</Typography>
  return <TableContainer sx={{ maxHeight: 400 }}><Table size="small" stickyHeader>
    <TableHead><TableRow>{columns.map(column => <TableCell key={column.key} sx={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{column.label}</TableCell>)}</TableRow></TableHead>
    <TableBody>{rows.map((row, index) => <TableRow key={index} hover>{columns.map(column => <TableCell key={column.key} sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>{column.render ? column.render(row) : row[column.key] ?? '—'}</TableCell>)}</TableRow>)}</TableBody>
  </Table></TableContainer>
}
function Trend({ items, valueKey, unit = '' }) {
  if (!items?.length) return <Typography sx={{ ...muted, py: 2 }}>No report data for this period.</Typography>
  const max = Math.max(1, ...items.map(item => item[valueKey] || 0))
  const points = items.map((item, index) => `${items.length === 1 ? 180 : 14 + index * 332 / (items.length - 1)},${115 - (item[valueKey] || 0) / max * 85}`).join(' ')
  const tick = Math.max(1, Math.ceil(items.length / 7))
  return <Box component="svg" viewBox="0 0 360 145" role="img" aria-label={items.map(item => `${item.period}: ${item[valueKey]}${unit}`).join(', ')} sx={{ width: '100%', height: 175, display: 'block', color: 'var(--blue-ink)' }}>
    <line x1="12" y1="115" x2="348" y2="115" stroke="var(--line)" />
    <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
    {items.map((item, index) => { const x = items.length === 1 ? 180 : 14 + index * 332 / (items.length - 1)
      const y = 115 - (item[valueKey] || 0) / max * 85
      return <g key={item.period}><circle cx={x} cy={y} r="3" fill="currentColor"><title>{item.period}: {item[valueKey]}{unit}</title></circle>
        {(index % tick === 0 || index === items.length - 1) && <text x={x} y="135" textAnchor="middle" fill="var(--muted)" fontSize="9">{item.period.length === 7 ? item.period : item.period.slice(5)}</text>}</g> } )}
  </Box>
}
function Bars({ rows, nameKey, countKey, money = false, displayName = label }) {
  if (!rows?.length) return <Typography sx={{ ...muted, py: 2 }}>No report data for this period.</Typography>
  const top = rows.slice(0, 10)
  const max = Math.max(1, ...top.map(row => row[countKey] || 0))
  return <Stack spacing={1.25} sx={{ mt: 1 }}>{top.map((row, index) => <Box key={`${row[nameKey]}-${index}`}>
    <Stack direction="row" justifyContent="space-between" gap={1}><Typography sx={{ fontSize: 12 }}>{displayName(row[nameKey])}</Typography><Typography sx={{ fontSize: 12, fontWeight: 650 }}>{money ? pesos(row[countKey]) : row[countKey]}</Typography></Stack>
    <Box sx={{ bgcolor: 'var(--surface-soft)', borderRadius: 2, height: 7, mt: .4, overflow: 'hidden' }}><Box sx={{ width: `${(row[countKey] || 0) / max * 100}%`, height: '100%', bgcolor: 'var(--blue-ink)', borderRadius: 2 }} /></Box>
  </Box>)}</Stack>
}
const bookingColumns = [
  { key: 'bookingDate', label: 'Scheduled Date' }, { key: 'reference', label: 'Booking', render: row => <Button size="small" component={Link} to={`/admin/bookings?open=${row.bookingId}`}>{row.reference}</Button> },
  { key: 'client', label: 'Client' }, { key: 'plate', label: 'Plate' },
  { key: 'status', label: 'Status', render: row => label(row.status) }, { key: 'bookingType', label: 'Source', render: row => label(row.bookingType) },
  { key: 'finalTotalCents', label: 'Locked Final Total', render: row => row.finalTotalCents == null ? '—' : pesos(row.finalTotalCents) },
]
const paymentColumns = [
  { key: 'verifiedAt', label: 'Verified Date', render: row => date(row.verifiedAt) }, { key: 'reference', label: 'Booking' },
  { key: 'client', label: 'Client' }, { key: 'stage', label: 'Stage', render: row => label(row.stage) },
  { key: 'method', label: 'Method', render: row => formatPaymentMethod(row.method) }, { key: 'amountCents', label: 'Amount', render: row => pesos(row.amountCents) },
  { key: 'verifiedBy', label: 'Verified By' },
]

export default function AdminReports() {
  const [draft, setDraft] = useState(initialRange)
  const [selected, setSelected] = useState(initialRange)
  const [tab, setTab] = useState(0)
  const [exportKind, setExportKind] = useState('bookings')
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const validation = useFormValidation('report', draft)
  useEffect(() => {
    const controller = new AbortController()
    api.get('/reports/analytics', { params: selected, signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) { setReport(response.data); setError('') } })
      .catch(requestError => { if (!controller.signal.aborted) { setReport(null); setError(friendlyError(requestError)) } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [selected])
  function apply(event) { event.preventDefault(); if (!validation.validate()) return; setLoading(true); setSelected({ ...draft }) }
  function reset() { setDraft(initialRange); setLoading(true); setSelected({ ...initialRange }); validation.reset() }
  async function exportReport() {
    if (exporting) return
    setExporting(true); setError('')
    try {
      const response = await api.get(`/reports/export/${exportKind}`, { params: selected, responseType: 'blob' })
      const url = URL.createObjectURL(response.data)
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = `toyota-${exportKind}-${selected.from}-to-${selected.to}.csv`
      document.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url)
    } catch (requestError) { setError(friendlyError(requestError)) }
    finally { setExporting(false) }
  }
  const kpis = report?.kpis
  return <>
    <PageHeading title="Reports" subtitle="Service operations and verified collections." preview={false} />
    <Paper component="form" noValidate onSubmit={apply} variant="outlined" sx={{ p: 2, mb: 2, borderColor: 'var(--line)', borderRadius: 2.5 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} alignItems={{ md: 'center' }} flexWrap="wrap" useFlexGap>
        <TextField label="Start date" type="date" size="small" required value={draft.from} {...validation.field('from')} onChange={event => setDraft(current => ({ ...current, from: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField label="End date" type="date" size="small" required value={draft.to} {...validation.field('to')} onChange={event => setDraft(current => ({ ...current, to: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }} />
        <Button type="submit" variant="contained" disabled={loading}>Apply</Button><Button onClick={reset} disabled={loading}>Reset</Button>
        <TextField select size="small" label="Export" value={exportKind} onChange={event => setExportKind(event.target.value)} sx={{ minWidth: 130 }}>
          {['bookings', 'payments', 'services', 'mechanics'].map(kind => <MenuItem key={kind} value={kind}>{label(kind)}</MenuItem>)}
        </TextField><Button onClick={exportReport} disabled={loading || exporting}>Export CSV</Button>
      </Stack>
      <Typography sx={{ ...muted, mt: 1 }}>Selected: {selected.from} to {selected.to} · Asia/Manila dates · Maximum 367 days</Typography>
    </Paper>
    {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
    {loading ? <Stack alignItems="center" sx={{ py: 8 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 1 }}>Loading reports…</Typography></Stack>
      : report && <>
        <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2, borderBottom: '1px solid var(--line)' }} aria-label="Report sections">
          {tabs.map(item => <Tab key={item} label={item} sx={{ minHeight: 42, fontSize: 12 }} />)}
        </Tabs>
        {tab === 0 && <Stack spacing={2}>
          <Kpis items={[
            { label: 'Bookings', value: kpis.bookings, note: 'Scheduled visits; provisional holds excluded' },
            { label: 'Completed services', value: kpis.completedServices, note: 'Released in selected period' },
            { label: 'Verified payments collected', value: pesos(kpis.verifiedPaymentsCents), note: 'Verified in selected period' },
            { label: 'Outstanding balance', value: pesos(kpis.outstandingBalanceCents), note: 'Ready for release; final billing locked in period' },
            { label: 'Average final service value', value: pesos(kpis.averageFinalServiceCents), note: 'Completed locked totals' },
            { label: 'Additional work approved', value: kpis.additionalWorkApproved, note: 'Client decisions in period' },
          ]} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2 }}>
            <Section title="Booking trend" caption={`${report.dateBasis.bookings} · ${report.bookings.group}`}><Trend items={report.bookings.trend} valueKey="count" /></Section>
            <Section title="Payments collected" caption={report.dateBasis.payments}><Trend items={report.payments.trend} valueKey="amountCents" unit=" cents" /></Section>
          </Box>
          <Section title="Completed service value" caption={report.dateBasis.completed}>
            <Typography sx={{ fontSize: 22, fontWeight: 700 }}>{pesos(report.completedService.valueCents)}</Typography>
            <Typography sx={muted}>Locked final totals for completed bookings. Separate from payments collected.</Typography>
          </Section>
        </Stack>}
        {tab === 1 && <Stack spacing={2}>
          <Section title="Bookings by status" caption="Scheduled booking date; awaiting downpayment shown separately"><Bars rows={Object.entries(report.bookings.byStatus).filter(([status, count]) => status !== 'awaiting_downpayment' && count).map(([status, count]) => ({ status, count }))} nameKey="status" countKey="count" />
            <Typography sx={{ ...muted, mt: 1 }}>Awaiting downpayment: {report.bookings.byStatus.awaiting_downpayment || 0}</Typography></Section>
          <Section title="Booking trend" caption={`${report.dateBasis.bookings} · ${report.bookings.group}`}><Trend items={report.bookings.trend} valueKey="count" /></Section>
          <Section title="Recent scheduled bookings" caption="Latest 25 in selected range"><ReportTable columns={bookingColumns} rows={report.bookings.rows} /></Section>
        </Stack>}
        {tab === 2 && <Stack spacing={2}>
          <Kpis items={[{ label: 'Verified downpayments', value: pesos(report.payments.downpaymentCents) },
            { label: 'Verified final payments', value: pesos(report.payments.finalPaymentCents) },
            { label: 'Total payments collected', value: pesos(report.payments.totalCents), note: 'Verified payments only' },
            { label: 'Completed service value', value: pesos(report.completedService.valueCents), note: 'Locked totals; release date' },
            { label: 'Outstanding balance', value: pesos(report.outstanding.balanceCents), note: 'Ready for release; final billing locked in period' },
          ]} />
          <Section title="Payment methods" caption="Verified payments only; no-charge amounts remain zero"><Bars rows={report.payments.methods} nameKey="method" countKey="amountCents" money displayName={formatPaymentMethod} />
            <ReportTable columns={[{ key: 'method', label: 'Method', render: row => formatPaymentMethod(row.method) }, { key: 'count', label: 'Count' }, { key: 'amountCents', label: 'Collected', render: row => pesos(row.amountCents) }]} rows={report.payments.methods} /></Section>
          <Section title="Recent verified payments" caption="Latest 25 by verification date"><ReportTable columns={paymentColumns} rows={report.payments.rows} /></Section>
        </Stack>}
        {tab === 3 && <Stack spacing={2}>
          <Section title="Original booked services" caption={report.dateBasis.services}><Bars rows={report.services.original} nameKey="name" countKey="bookings" />
            <ReportTable columns={[{ key: 'name', label: 'Service' }, { key: 'bookings', label: 'Bookings' }, { key: 'completed', label: 'Completed' },
              { key: 'completedSnapshotValueCents', label: 'Completed Snapshot Value', render: row => pesos(row.completedSnapshotValueCents) }]} rows={report.services.original} /></Section>
          <Section title="Approved and performed additional services" caption="Performed date; service items only"><ReportTable columns={[
            { key: 'name', label: 'Service' }, { key: 'performed', label: 'Times Performed' },
            { key: 'valueCents', label: 'Approved Snapshot Value', render: row => pesos(row.valueCents) }]} rows={report.services.additional} /></Section>
        </Stack>}
        {tab === 4 && <Section title="Mechanic operations" caption={report.dateBasis.mechanics}><ReportTable columns={[
          { key: 'employeeId', label: 'Mechanic ID' }, { key: 'name', label: 'Mechanic' },
          { key: 'assignedJobs', label: 'Assigned' }, { key: 'completedJobs', label: 'Completed' }, { key: 'activeJobs', label: 'Active' },
          { key: 'averageMinutes', label: 'Avg. Service Minutes' }, { key: 'additionalWorkRequests', label: 'Extra Work Requests' },
          { key: 'performedAdditionalWork', label: 'Extra Work Performed' },
        ]} rows={report.mechanics} /></Section>}
        {tab === 5 && <Stack spacing={2}>
          <Kpis items={[{ label: 'Requests submitted', value: report.additionalWork.submitted },
            { label: 'Sent to client', value: report.additionalWork.sentToClient },
            { label: 'Approved', value: report.additionalWork.approved }, { label: 'Declined', value: report.additionalWork.declined },
            { label: 'Performed', value: report.additionalWork.performed },
            { label: 'Approval rate', value: `${report.additionalWork.approvalRate}%`, note: 'Approved ÷ client-decided requests' },
            { label: 'Approved value', value: pesos(report.additionalWork.approvedValueCents), note: 'Approved snapshot totals' },
            { label: 'Performed value', value: pesos(report.additionalWork.performedValueCents), note: 'Approved, performed snapshot totals' },
          ]} /><Typography sx={muted}>Counts use each event’s date. Pending and declined work is excluded from performed value.</Typography>
        </Stack>}
        {tab === 6 && <Stack spacing={2}>
          <Kpis items={[{ label: 'Upcoming reminders', value: report.maintenance.upcoming },
            { label: 'Due reminders', value: report.maintenance.due },
            { label: 'Superseded recommendations', value: report.maintenance.superseded, note: 'Superseded in selected period' }]} />
          <Typography sx={muted}>{report.dateBasis.maintenance}. Due uses configured date or mileage recommendations.</Typography>
        </Stack>}
      </>}
  </>
}
