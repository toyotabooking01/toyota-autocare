import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert, Box, Button, CircularProgress, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material'
import api from '../services/api'
import { PageHeading } from '../components/DashboardParts'
import { DetailDialog, DetailGrid, DetailInfo, DetailSection, DetailVehicle } from '../components/RecordDetails'
import RecordList, { RecordPanel } from '../components/RecordList'
import { financialDocumentButtonLabel, openFinancialPdf } from '../utils/openFinancialPdf'
import useCatalog from './useCatalog'
import { MinimalStatus } from '../components/StatusChip'
import { NavArrowRight, Wrench } from 'iconoir-react'
import { QuietDetailsButton } from '../components/RowActions'

const date = value => value ? new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' }) : 'Date unavailable'
const money = cents => Number.isSafeInteger(cents) ? `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Unavailable'
const vehicleName = vehicle => vehicle ? `${vehicle.make} ${vehicle.model} ${vehicle.year || ''}` : 'Vehicle unavailable'
const itemName = item => item.name || 'Service details unavailable'

export default function ServiceHistory({ role = 'client' }) {
  const [searchParams] = useSearchParams()
  const [vehicle, setVehicle] = useState(searchParams.get('vehicle') || '')
  const [vehicles, setVehicles] = useState([])
  const [order, setOrder] = useState('newest')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [documentError, setDocumentError] = useState('')
  const params = new URLSearchParams({ order })
  if (vehicle) params.set('vehicle', vehicle)
  const endpoint = `/service-history?${params}`
  const { items, loading, error, setError, pagination } = useCatalog(endpoint, { search }, true)
  useEffect(() => {
    if (role !== 'client') return undefined
    const controller = new AbortController()
    api.get('/vehicles', { params: { archive: 'all' }, signal: controller.signal })
      .then(response => setVehicles(response.data.items || [])).catch(() => {})
    return () => controller.abort()
  }, [role])
  const selected = items.find(item => String(item._id) === selectedId)
  function openDocument(doc) {
    return openFinancialPdf({ kind: doc.type === 'final_service' ? 'invoice' : 'receipt', id: doc._id,
      expectedType: doc.type, onError: setDocumentError })
  }
  return <>
    <PageHeading title="Service History" subtitle={role === 'client' ? 'Completed service records for your vehicles.' : 'Completed customer service records.'} preview={false} />
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    <RecordPanel className={`service-history-workspace admin-list-surface${role === 'client' ? ' service-history-workspace--client' : ''}`}>
      <Box className="service-history-toolbar admin-list-toolbar">
        <TextField className="service-history-search" size="small" label={role === 'client' ? 'Search vehicle, plate, or service' : 'Search plate, vehicle, customer or service'} value={search} onChange={event => setSearch(event.target.value)} slotProps={{ htmlInput: { maxLength: 100 } }} />
        {role === 'client' && <TextField select size="small" label="Vehicle" value={vehicle} onChange={event => setVehicle(event.target.value)}>
          <MenuItem value="">All vehicles</MenuItem>{vehicles.map(item => <MenuItem key={item._id} value={item._id}>{vehicleName(item)} · {item.plateNumber}</MenuItem>)}
        </TextField>}
        <TextField select size="small" label="Date order" value={order} onChange={event => setOrder(event.target.value)}>
          <MenuItem value="newest">Newest first</MenuItem><MenuItem value="oldest">Oldest first</MenuItem>
        </TextField>
      </Box>
      <Box className="service-history-header admin-list-header" aria-hidden="true"><span>Vehicle</span>{role !== 'client' && <span>Customer</span>}<span>Service</span><span>Completed</span><span>{role === 'admin' ? 'Details' : 'Action'}</span></Box>
      <RecordList className="service-history-list" items={items} pagination={pagination} loading={loading && <Stack alignItems="center" sx={{ py: 6 }}><CircularProgress size={28} /></Stack>}
        empty="No completed services yet.">
        {item => <Box component="article" className="service-history-row admin-list-row" key={item._id}>
          <Box className="service-history-vehicle"><span className="service-history-icon" aria-hidden="true"><Wrench width={18} height={18} strokeWidth={1.7} /></span><Box><Typography>{vehicleName(item.vehicle)}</Typography><small>{item.vehicle?.plateNumber || 'Plate unavailable'}</small></Box></Box>
          {role !== 'client' && <Typography className="service-history-customer">{item.client?.fullName || 'Client unavailable'}</Typography>}
          <Typography className="service-history-services" title={[...item.originalServices, ...item.additionalWork].map(itemName).join(', ')}>{[...item.originalServices, ...item.additionalWork].map(itemName).join(', ') || 'Service details unavailable'}</Typography>
          <Typography className="service-history-date">{date(item.completedAt)}</Typography>
          <QuietDetailsButton className="admin-list-details" onClick={() => setSelectedId(String(item._id))} />
        </Box>}
      </RecordList>
    </RecordPanel>
    <DetailDialog className="service-record-dialog" open={Boolean(selected)} onClose={() => setSelectedId(null)} title="Service Record" reference={selected?.bookingReference}
      status={selected && <MinimalStatus label="Completed" status="completed" />}>
      {selected && <Stack className="service-record-content" spacing={1.5}>
        <DetailGrid>
          <DetailSection title="Service overview"><DetailInfo items={[
            ['Booking reference', selected.bookingReference], ['Completed', date(selected.completedAt)],
            ['Mileage at service', selected.serviceMileage == null ? 'Not recorded' : `${selected.serviceMileage.toLocaleString()} km`],
            ['Released', date(selected.releasedAt)], ['Released by', selected.releasedBy?.fullName || selected.releasedByRole || 'Unavailable'],
          ]} /></DetailSection>
          <DetailSection title="Vehicle"><DetailVehicle vehicle={selected.vehicle} showCatalogImage={false} /></DetailSection>
        </DetailGrid>
        <DetailGrid>
          <DetailSection title="Customer"><DetailInfo items={[
            ['Customer', selected.client?.fullName || 'Client unavailable'],
          ]} /></DetailSection>
          <DetailSection title="Mechanic / job"><DetailInfo items={[
            ['Assigned mechanic', selected.assignedMechanic?.fullName || 'Unavailable'],
            ['Service notes', selected.bookingNotes || <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>No notes recorded</Box>],
            ['Mechanic notes', selected.mechanicNotes || <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>No notes recorded</Box>],
          ]} /></DetailSection>
        </DetailGrid>
        <DetailSection title="Services performed">
          <Box className="service-record-lines">
            <Typography className="service-record-subheading">Original services</Typography>
            {selected.originalServices.length ? selected.originalServices.map((item, index) => <Box className="service-record-line" key={index}><Typography>{itemName(item)}</Typography><Typography>{money(item.priceCents)}</Typography></Box>) : <Typography className="service-record-empty">Service details unavailable</Typography>}
            <Typography className="service-record-subheading service-record-additional-heading">Approved and performed additional work</Typography>
            {selected.additionalWork.length ? selected.additionalWork.map((item, index) => <Box className="service-record-line" key={index}><Typography>{itemName(item)} <span>{item.quantity} ×</span></Typography><Typography>{money(item.lineTotalCents)}</Typography></Box>) : <Typography className="service-record-empty">None recorded</Typography>}
          </Box>
        </DetailSection>
        <DetailGrid>
          <DetailSection title="Checklist">
            <Typography className="service-record-checklist-count">{selected.checklist?.length ? `${selected.checklist.filter(item => item.isCompleted).length} of ${selected.checklist.length} items completed` : 'No checklist recorded'}</Typography>
            {selected.checklist?.length > 0 && <Box component="details" className="service-history-checklist"><Box component="summary">View checklist details</Box><Box className="service-history-checklist-items">
              {selected.checklist.map((item, index) => <Typography key={index} sx={{ fontSize: 12 }}>{item.isCompleted ? '✓' : '○'} {item.description}</Typography>)}
            </Box></Box>}
          </DetailSection>
          <DetailSection title="Billing summary"><DetailInfo items={[
            ['Final service total', money(selected.finalTotalCents)], ['Payment status', <MinimalStatus label={selected.paymentStatus} status={selected.paymentStatus === 'Fully Paid' ? 'paid' : 'unknown'} />],
          ]} /></DetailSection>
        </DetailGrid>
        <DetailSection title="Documents">
          {documentError && <Alert severity="error" sx={{ mb: 1 }}>{documentError}</Alert>}
          {[selected.invoice, ...selected.receipts].filter(Boolean).length ? [selected.invoice, ...selected.receipts].filter(Boolean).map((doc, index) => <Box key={doc._id}>
            {index > 0 && <Divider />}
            <Box className="service-history-document">
              <Typography className="service-history-document-name">{doc.type === 'final_service' ? 'Final Service Invoice' : doc.type === 'downpayment' ? 'Downpayment Receipt' : doc.type === 'final_payment' ? 'Final Payment Receipt' : 'Full Payment Receipt'}</Typography>
              <Typography className="service-history-document-reference">{doc.number}</Typography>
              <Button size="small" onClick={() => openDocument(doc)}>{financialDocumentButtonLabel(doc.type)} <NavArrowRight width={15} height={15} strokeWidth={1.7} /></Button>
            </Box>
          </Box>) : <Typography sx={{ fontSize: 13 }}>No documents available</Typography>}
        </DetailSection>
      </Stack>}
    </DetailDialog>
  </>
}
