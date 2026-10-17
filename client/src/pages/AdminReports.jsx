import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Box, Button, CircularProgress, MenuItem, Paper, Stack, Tab, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Tabs, TextField, Typography } from '@mui/material'
import { Download, NavArrowRight } from 'iconoir-react'
import useFormValidation from '../components/useFormValidation'
import ListPagination from '../components/ListPagination'
import { MinimalStatus } from '../components/StatusChip'
import api from '../services/api'
import { PageHeading } from '../components/DashboardParts'
import { manilaToday } from './dashboardData'
import { friendlyError } from '../utils/friendlyErrors'
import { formatPaymentMethod } from '../utils/paymentMethod'
import '../reports.css'

const today = manilaToday()
const initialRange = { from: `${today.slice(0, 7)}-01`, to: today }
const tabs = ['Overview', 'Bookings', 'Revenue', 'Services', 'Mechanics', 'Additional Work', 'Maintenance']
const REPORT_PAGE_SIZE = 5
const pesos = cents => `₱${((cents || 0) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const date = value => value ? new Date(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric' }) : '—'
const label = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase())

function Kpis({ items }) {
  return <Box className="reports-kpis">{items.map(item => <Box key={item.label} className="reports-kpi">
    <Typography className="reports-kpi-label">{item.label}</Typography>
    <Typography className="reports-kpi-value">{item.value}</Typography>
    {item.note && <Typography className="reports-kpi-note">{item.note}</Typography>}
  </Box>)}</Box>
}

function Section({ title, caption, children, className = '' }) {
  return <Box component="section" className={`reports-panel${className ? ` ${className}` : ''}`}>
    <Typography component="h2" className="reports-section-title">{title}</Typography>
    {caption && <Typography className="reports-section-caption">{caption}</Typography>}
    {children}
  </Box>
}

function ReportTable({ columns, rows, empty = 'No report data for this period.', paginate = true }) {
  const [selection, setSelection] = useState({ rows, page: 1 })
  const page = selection.rows === rows ? selection.page : 1
  if (!rows?.length) return <Typography className="reports-empty">{empty}</Typography>
  const totalPages = Math.ceil(rows.length / REPORT_PAGE_SIZE)
  const visibleRows = paginate ? rows.slice((page - 1) * REPORT_PAGE_SIZE, page * REPORT_PAGE_SIZE) : rows
  const pagination = paginate ? { page, limit: REPORT_PAGE_SIZE, totalItems: rows.length, totalPages,
    onPageChange: value => setSelection({ rows, page: value }) } : null
  return <>
    <TableContainer className="reports-table-container"><Table size="small" className="reports-table">
      <TableHead><TableRow>{columns.map(column => <TableCell key={column.key} align={column.align || 'left'} style={column.width ? { width: column.width } : undefined}>{column.label}</TableCell>)}</TableRow></TableHead>
      <TableBody>{visibleRows.map((row, index) => <TableRow key={row.bookingId || row.reference || row.employeeId || row.name || index}>
        {columns.map(column => <TableCell key={column.key} align={column.align || 'left'}>{column.render ? column.render(row) : row[column.key] ?? '—'}</TableCell>)}
      </TableRow>)}</TableBody>
    </Table></TableContainer>
    {pagination && <ListPagination pagination={pagination} />}
  </>
}

function Trend({ items, valueKey, money = false }) {
  if (!items?.length) return <Typography className="reports-empty">No report data for this period.</Typography>
  const max = Math.max(1, ...items.map(item => item[valueKey] || 0))
  const xAt = index => items.length === 1 ? 248 : 52 + index * 420 / (items.length - 1)
  const yAt = item => 148 - (item[valueKey] || 0) / max * 116
  const points = items.map((item, index) => `${xAt(index)},${yAt(item)}`).join(' ')
  const tickEvery = Math.max(1, Math.ceil(items.length / 7))
  const axisValue = fraction => {
    const value = max * fraction / 100
    if (!money) return Math.round(value * 100).toLocaleString('en-PH')
    if (value >= 1000000) return `₱${(value / 1000000).toLocaleString('en-PH', { maximumFractionDigits: 1 })}M`
    if (value >= 1000) return `₱${Math.round(value / 1000).toLocaleString('en-PH')}k`
    return `₱${Math.round(value).toLocaleString('en-PH')}`
  }
  return <Box component="svg" viewBox="0 0 500 200" role="img"
    aria-label={items.map(item => `${item.period}: ${money ? pesos(item[valueKey]) : item[valueKey]}`).join(', ')} className="reports-trend-chart">
    {[32, 70, 109, 148].map((y, index) => <g key={y}>
      <line x1="48" y1={y} x2="480" y2={y} className="reports-chart-grid" />
      <text x="40" y={y + 3} textAnchor="end" className="reports-chart-axis">{axisValue(1 - index / 3)}</text>
    </g>)}
    <polyline points={points} className="reports-chart-line" />
    {items.map((item, index) => <g key={item.period}>
      <circle cx={xAt(index)} cy={yAt(item)} r="3" className="reports-chart-point"><title>{item.period}: {money ? pesos(item[valueKey]) : item[valueKey]}</title></circle>
      {(index % tickEvery === 0 || index === items.length - 1) && <text x={xAt(index)} y="173" textAnchor="middle" className="reports-chart-axis">
        {item.period.length === 7 ? item.period : item.period.slice(5)}
      </text>}
    </g>)}
  </Box>
}

function Bars({ rows, nameKey, countKey, displayName = label, maxRows = 10 }) {
  if (!rows?.length) return <Typography className="reports-empty">No report data for this period.</Typography>
  const visible = rows.slice(0, maxRows)
  const max = Math.max(1, ...visible.map(row => row[countKey] || 0))
  return <Stack className="reports-bars" spacing={1}>{visible.map((row, index) => <Box className="reports-bar-row" key={`${row[nameKey]}-${index}`}>
    <Box className="reports-bar-heading"><Typography className="reports-bar-label">{displayName(row[nameKey])}</Typography>
      <Typography className="reports-bar-count">{row[countKey]}</Typography></Box>
    <Box className="reports-bar-track"><Box className="reports-bar-fill" sx={{ width: `${(row[countKey] || 0) / max * 100}%` }} /></Box>
  </Box>)}</Stack>
}

const bookingColumns = [
  { key: 'bookingDate', label: 'Scheduled Date', render: row => date(row.bookingDate), width: '115px' },
  { key: 'reference', label: 'Booking' }, { key: 'client', label: 'Client' }, { key: 'plate', label: 'Plate' },
  { key: 'status', label: 'Status', render: row => <MinimalStatus label={label(row.status)} status={row.status} /> },
  { key: 'bookingType', label: 'Source', render: row => label(row.bookingType) },
  { key: 'finalTotalCents', label: 'Locked Final Total', align: 'right', render: row => row.finalTotalCents == null ? '—' : pesos(row.finalTotalCents) },
  { key: 'details', label: 'Details', render: row => <Button className="reports-table-link" component={Link} to={`/admin/bookings?open=${row.bookingId}`} endIcon={<NavArrowRight width={15} height={15} strokeWidth={1.7} />}>Details</Button> },
]
const paymentColumns = [
  { key: 'verifiedAt', label: 'Verified Date', render: row => date(row.verifiedAt), width: '115px' }, { key: 'reference', label: 'Booking' },
  { key: 'client', label: 'Client' }, { key: 'stage', label: 'Stage', render: row => label(row.stage) },
  { key: 'method', label: 'Method', render: row => formatPaymentMethod(row.method) },
  { key: 'amountCents', label: 'Amount', align: 'right', render: row => pesos(row.amountCents) }, { key: 'verifiedBy', label: 'Verified By' },
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
  return <Box className="reports-page">
    <PageHeading title="Reports" subtitle="Service operations and verified collections." preview={false} />
    <Paper component="form" className="reports-toolbar" noValidate onSubmit={apply} variant="outlined">
      <Box className="reports-toolbar-controls">
        <Box className="reports-date-controls">
          <TextField className="reports-date-field" label="Start date" type="date" size="small" required value={draft.from} {...validation.field('from')} onChange={event => setDraft(current => ({ ...current, from: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField className="reports-date-field" label="End date" type="date" size="small" required value={draft.to} {...validation.field('to')} onChange={event => setDraft(current => ({ ...current, to: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }} />
          <Button type="submit" variant="contained" disabled={loading}>Apply</Button>
          <Button className="reports-reset" onClick={reset} disabled={loading}>Reset</Button>
        </Box>
        <Box className="reports-export-controls">
          <TextField select size="small" label="Export" value={exportKind} onChange={event => setExportKind(event.target.value)}>
            {['bookings', 'payments', 'services', 'mechanics'].map(kind => <MenuItem key={kind} value={kind}>{label(kind)}</MenuItem>)}
          </TextField>
          <Button variant="outlined" startIcon={<Download width={16} height={16} strokeWidth={1.8} />} onClick={exportReport} disabled={loading || exporting}>
            {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
        </Box>
      </Box>
      <Typography className="reports-range-note">Selected: {selected.from} to {selected.to} · Asia/Manila dates · Maximum 367 days</Typography>
    </Paper>
    {error && <Alert severity="error" className="reports-error" onClose={() => setError('')}>{error}</Alert>}
    {loading ? <Stack alignItems="center" className="reports-loading" role="status"><CircularProgress size={28} /><Typography sx={{ mt: 1 }}>Loading reports…</Typography></Stack>
      : report && <>
        <Tabs className="reports-tabs" value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto" aria-label="Report sections">
          {tabs.map(item => <Tab key={item} label={item} />)}
        </Tabs>
        <Box className="reports-tab-content">
          {tab === 0 && <Stack className="reports-tab-stack">
            <Kpis items={[
              { label: 'Bookings', value: kpis.bookings, note: 'Scheduled visits; provisional holds excluded' },
              { label: 'Completed services', value: kpis.completedServices, note: 'Released in selected period' },
              { label: 'Verified payments collected', value: pesos(kpis.verifiedPaymentsCents), note: 'Verified in selected period' },
              { label: 'Outstanding balance', value: pesos(kpis.outstandingBalanceCents), note: 'Ready for release; final billing locked in period' },
              { label: 'Average final service value', value: pesos(kpis.averageFinalServiceCents), note: 'Completed locked totals' },
              { label: 'Additional work approved', value: kpis.additionalWorkApproved, note: 'Client decisions in period' },
            ]} />
            <Box className="reports-chart-grid">
              <Section title="Booking trend" caption={`${report.dateBasis.bookings} · ${report.bookings.group}`}><Trend items={report.bookings.trend} valueKey="count" /></Section>
              <Section title="Payments collected" caption={report.dateBasis.payments}><Trend items={report.payments.trend} valueKey="amountCents" money /></Section>
            </Box>
            <Section title="Completed service value" caption={report.dateBasis.completed}>
              <Typography className="reports-summary-value">{pesos(report.completedService.valueCents)}</Typography>
              <Typography className="reports-summary-note">Locked final totals for completed bookings. Separate from payments collected.</Typography>
            </Section>
            <Section title="Recent scheduled bookings" caption="Latest 25 in selected range">
              <ReportTable columns={bookingColumns} rows={report.bookings.rows} />
            </Section>
          </Stack>}
          {tab === 1 && <Stack className="reports-tab-stack">
            <Section title="Bookings by status" caption="Scheduled booking date; awaiting downpayment shown separately">
              <Bars rows={Object.entries(report.bookings.byStatus).map(([status, count]) => ({ status, count }))} nameKey="status" countKey="count" maxRows={12} />
            </Section>
            <Section title="Booking trend" caption={`${report.dateBasis.bookings} · ${report.bookings.group}`}><Trend items={report.bookings.trend} valueKey="count" /></Section>
            <Section title="Recent scheduled bookings" caption="Latest 25 in selected range"><ReportTable columns={bookingColumns} rows={report.bookings.rows} /></Section>
          </Stack>}
          {tab === 2 && <Stack className="reports-tab-stack">
            <Kpis items={[{ label: 'Verified downpayments', value: pesos(report.payments.downpaymentCents) },
              { label: 'Verified final payments', value: pesos(report.payments.finalPaymentCents) },
              { label: 'Total payments collected', value: pesos(report.payments.totalCents), note: 'Verified payments only' },
              { label: 'Completed service value', value: pesos(report.completedService.valueCents), note: 'Locked totals; release date' },
              { label: 'Outstanding balance', value: pesos(report.outstanding.balanceCents), note: 'Ready for release; final billing locked in period' },
            ]} />
            <Section title="Payment methods" caption="Verified payments only; no-charge amounts remain zero">
              <ReportTable paginate={false} columns={[
                { key: 'method', label: 'Method', render: row => formatPaymentMethod(row.method) },
                { key: 'count', label: 'Count', align: 'right' },
                { key: 'amountCents', label: 'Collected', align: 'right', render: row => pesos(row.amountCents) },
              ]} rows={report.payments.methods} />
            </Section>
            <Section title="Recent verified payments" caption="Latest 25 by verification date"><ReportTable columns={paymentColumns} rows={report.payments.rows} /></Section>
          </Stack>}
          {tab === 3 && <Stack className="reports-tab-stack">
            <Section title="Original booked services" caption={report.dateBasis.services}><ReportTable columns={[
              { key: 'name', label: 'Service' }, { key: 'bookings', label: 'Bookings', align: 'right' },
              { key: 'completed', label: 'Completed', align: 'right' },
              { key: 'completedSnapshotValueCents', label: 'Completed Snapshot Value', align: 'right', render: row => pesos(row.completedSnapshotValueCents) },
            ]} rows={report.services.original} /></Section>
            <Section title="Approved and performed additional services" caption="Performed date; service items only"><ReportTable columns={[
              { key: 'name', label: 'Service' }, { key: 'performed', label: 'Times Performed', align: 'right' },
              { key: 'valueCents', label: 'Performed Snapshot Value', align: 'right', render: row => pesos(row.valueCents) },
            ]} rows={report.services.additional} /></Section>
          </Stack>}
          {tab === 4 && <Section title="Mechanic operations" caption={report.dateBasis.mechanics}><ReportTable columns={[
            { key: 'name', label: 'Mechanic' }, { key: 'employeeId', label: 'Mechanic ID' },
            { key: 'assignedJobs', label: 'Assigned', align: 'right' }, { key: 'completedJobs', label: 'Completed', align: 'right' },
            { key: 'activeJobs', label: 'Active', align: 'right' },
            { key: 'averageMinutes', label: 'Avg. Service Minutes', align: 'right', render: row => row.averageMinutes == null ? '—' : row.averageMinutes },
            { key: 'additionalWorkRequests', label: 'Extra Work Requests', align: 'right' },
            { key: 'performedAdditionalWork', label: 'Extra Work Performed', align: 'right' },
          ]} rows={report.mechanics} /></Section>}
          {tab === 5 && <Stack className="reports-tab-stack">
            <Kpis items={[{ label: 'Requests submitted', value: report.additionalWork.submitted },
              { label: 'Sent to client', value: report.additionalWork.sentToClient },
              { label: 'Approved', value: report.additionalWork.approved }, { label: 'Declined', value: report.additionalWork.declined },
              { label: 'Performed', value: report.additionalWork.performed },
              { label: 'Approval rate', value: `${report.additionalWork.approvalRate}%`, note: 'Approved ÷ client-decided requests' },
              { label: 'Approved value', value: pesos(report.additionalWork.approvedValueCents), note: 'Approved snapshot totals' },
              { label: 'Performed value', value: pesos(report.additionalWork.performedValueCents), note: 'Approved, performed snapshot totals' },
            ]} />
            <Typography className="reports-range-note">Counts use each event’s date. Pending and declined work is excluded from performed value.</Typography>
          </Stack>}
          {tab === 6 && <Stack className="reports-tab-stack">
            <Kpis items={[{ label: 'Upcoming reminders', value: report.maintenance.upcoming },
              { label: 'Due reminders', value: report.maintenance.due },
              { label: 'Superseded recommendations', value: report.maintenance.superseded, note: 'Superseded in selected period' }]} />
            <Typography className="reports-range-note">{report.dateBasis.maintenance}. Due uses configured date or mileage recommendations.</Typography>
          </Stack>}
        </Box>
      </>}
  </Box>
}
