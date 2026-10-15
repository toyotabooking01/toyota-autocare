import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert, Box, Button, CircularProgress, MenuItem, Stack, TextField, Typography } from '@mui/material'
import api from '../services/api'
import { PageHeading } from '../components/DashboardParts'
import { DetailDialog, DetailGrid, DetailInfo, DetailSection, DetailVehicle } from '../components/RecordDetails'
import RecordList, { RecordCard, RecordActions, RecordPanel } from '../components/RecordList'
import { DetailsButton } from '../components/RowActions'
import { financialDocumentButtonLabel, openFinancialPdf } from '../utils/openFinancialPdf'
import useCatalog from './useCatalog'

const date = value => value ? new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' }) : 'Date unavailable'
const money = cents => Number.isSafeInteger(cents) ? `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Unavailable'
const vehicleName = vehicle => vehicle ? `${vehicle.make} ${vehicle.model} ${vehicle.year || ''}` : 'Vehicle unavailable'
const itemName = item => item.name || 'Service details unavailable'

export default function ServiceHistory({ role = 'client' }) {
  const [searchParams] = useSearchParams()
  const [vehicle, setVehicle] = useState(searchParams.get('vehicle') || '')
  const [vehicles, setVehicles] = useState([])
  const [order, setOrder] = useState('newest')
  const [plate, setPlate] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [documentError, setDocumentError] = useState('')
  const params = new URLSearchParams({ order })
  if (vehicle) params.set('vehicle', vehicle)
  if (role !== 'client' && plate.trim()) params.set('plate', plate.trim())
  const endpoint = `/service-history?${params}`
  const { items, loading, error, setError, pagination } = useCatalog(endpoint, {}, true)
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
    <RecordPanel>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        {role === 'client' && <TextField select size="small" label="Vehicle" value={vehicle} onChange={event => setVehicle(event.target.value)} sx={{ minWidth: 220 }}>
          <MenuItem value="">All vehicles</MenuItem>{vehicles.map(item => <MenuItem key={item._id} value={item._id}>{vehicleName(item)} · {item.plateNumber}</MenuItem>)}
        </TextField>}
        {role !== 'client' && <TextField size="small" label="Filter by plate" value={plate} onChange={event => setPlate(event.target.value)} sx={{ minWidth: 190 }} />}
        <TextField select size="small" label="Date order" value={order} onChange={event => setOrder(event.target.value)} sx={{ minWidth: 165 }}>
          <MenuItem value="newest">Newest first</MenuItem><MenuItem value="oldest">Oldest first</MenuItem>
        </TextField>
      </Stack>
      <RecordList items={items} pagination={pagination} loading={loading && <Stack alignItems="center" sx={{ py: 6 }}><CircularProgress size={28} /></Stack>}
        empty="No completed services yet.">
        {item => <RecordCard key={item._id} entityType="service">
          <Box className="record-card-copy">
            <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{vehicleName(item.vehicle)}</Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{item.vehicle?.plateNumber || 'Plate unavailable'}</Typography>
            {role !== 'client' && <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{item.client?.fullName || 'Client unavailable'}</Typography>}
            <Typography sx={{ fontSize: 12, mt: .5 }}>{[...item.originalServices, ...item.additionalWork].map(itemName).join(', ') || 'Service details unavailable'}</Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Completed {date(item.completedAt)} · {item.serviceMileage == null ? 'Mileage unavailable' : `${item.serviceMileage.toLocaleString()} km`} · {money(item.finalTotalCents)}</Typography>
          </Box>
          <RecordActions><DetailsButton onClick={() => setSelectedId(String(item._id))}>View Service Record</DetailsButton></RecordActions>
        </RecordCard>}
      </RecordList>
    </RecordPanel>
    <DetailDialog open={Boolean(selected)} onClose={() => setSelectedId(null)} title="Service record" reference={selected?.bookingReference}>
      {selected && <Stack spacing={2}>
        <DetailGrid>
          <DetailSection title="Service overview"><DetailInfo items={[
            ['Booking reference', selected.bookingReference], ['Completed', date(selected.completedAt)],
            ['Mileage at service', selected.serviceMileage == null ? 'Not recorded' : `${selected.serviceMileage.toLocaleString()} km`],
            ['Released', date(selected.releasedAt)], ['Released by', selected.releasedBy?.fullName || selected.releasedByRole || 'Unavailable'],
          ]} /></DetailSection>
          <DetailSection title="Vehicle"><DetailVehicle vehicle={selected.vehicle} /></DetailSection>
        </DetailGrid>
        <DetailSection title="Services performed">
          <Typography sx={{ fontWeight: 650, fontSize: 13 }}>Original services</Typography>
          {selected.originalServices.length ? selected.originalServices.map((item, index) => <Typography key={index} sx={{ fontSize: 13 }}>{itemName(item)} · {money(item.priceCents)}</Typography>) : <Typography sx={{ fontSize: 13 }}>Service details unavailable</Typography>}
          <Typography sx={{ fontWeight: 650, fontSize: 13, mt: 1 }}>Approved and performed additional work</Typography>
          {selected.additionalWork.length ? selected.additionalWork.map((item, index) => <Typography key={index} sx={{ fontSize: 13 }}>{itemName(item)} · {item.quantity} × · {money(item.lineTotalCents)}</Typography>) : <Typography sx={{ fontSize: 13 }}>None recorded</Typography>}
        </DetailSection>
        <DetailSection title="Mechanic / job"><DetailInfo items={[
          ['Assigned mechanic', selected.assignedMechanic?.fullName || 'Unavailable'],
          ['Service notes', selected.bookingNotes || 'No notes recorded'],
          ['Mechanic notes', selected.mechanicNotes || 'No notes recorded'],
          ['Checklist', selected.checklist?.length ? `${selected.checklist.filter(item => item.isCompleted).length} of ${selected.checklist.length} items completed` : 'No checklist recorded'],
        ]} />
          {selected.checklist?.map((item, index) => <Typography key={index} sx={{ fontSize: 12 }}>{item.isCompleted ? '✓' : '○'} {item.description}</Typography>)}
        </DetailSection>
        <DetailSection title="Billing summary"><DetailInfo items={[
          ['Final service total', money(selected.finalTotalCents)], ['Payment status', selected.paymentStatus],
        ]} /></DetailSection>
        <DetailSection title="Documents">
          {documentError && <Alert severity="error" sx={{ mb: 1 }}>{documentError}</Alert>}
          {[selected.invoice, ...selected.receipts].filter(Boolean).length ? [selected.invoice, ...selected.receipts].filter(Boolean).map(doc =>
            <Stack key={doc._id} direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ py: .5 }}>
              <Typography sx={{ fontSize: 13 }}>{doc.type === 'final_service' ? 'Final Service Invoice' : doc.type === 'downpayment' ? 'Downpayment Receipt' : doc.type === 'final_payment' ? 'Final Payment Receipt' : 'Full Payment Receipt'} · {doc.number}</Typography>
              <Button size="small" onClick={() => openDocument(doc)}>{financialDocumentButtonLabel(doc.type)}</Button>
            </Stack>) : <Typography sx={{ fontSize: 13 }}>No documents available</Typography>}
        </DetailSection>
      </Stack>}
    </DetailDialog>
  </>
}
