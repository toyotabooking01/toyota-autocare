import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material'
import { DetailsButton } from '../components/RowActions'
import { StatusBadge } from '../components/StatusChip'
import { DetailDialog, DetailGrid, DetailInfo, DetailSection, DetailVehicle } from '../components/RecordDetails'
import { PageHeading } from '../components/DashboardParts'
import RecordList, { RecordCard, RecordActions, RecordPanel } from '../components/RecordList'
import useCatalog from './useCatalog'
import { dateText, vehicleText } from './maintenanceDisplay'

const colors = {
  upcoming: { bgcolor: 'var(--blue-soft)', color: 'var(--blue-ink)' },
  due: { bgcolor: 'var(--amber-soft)', color: 'var(--amber-ink)' },
  completed: { bgcolor: 'var(--green-soft)', color: 'var(--green-ink)' },
  dismissed: { bgcolor: 'var(--surface-soft)', color: 'var(--muted)' },
}
function recommendation(item) {
  return [item.nextRecommendedServiceDate && `Date: ${dateText(item.nextRecommendedServiceDate)}`,
    item.nextRecommendedMileage != null && `Mileage: ${Number(item.nextRecommendedMileage).toLocaleString('en-PH')} km`]
    .filter(Boolean).join(' · ') || 'Recommendation unavailable'
}
function bookPath(item) { return `/client/book-service?vehicle=${item.vehicle?._id}&service=${item.service?._id}` }
function canBook(item) { return item.service?._id && item.vehicle?._id && item.vehicle.isArchived !== true && item.service.isActive !== false && item.service.isArchived !== true }

export default function MaintenanceReminders({ role }) {
  const [searchParams] = useSearchParams()
  const admin = role === 'admin'
  const { items, loading, error, setError, pagination } = useCatalog('/maintenance-reminders', {}, admin)
  const [selectedId, setSelectedId] = useState(searchParams.get('open'))
  const selected = items.find(item => String(item._id) === selectedId)
  return <>
    <PageHeading title={admin ? 'Reminders' : 'Maintenance Reminders'} subtitle={admin ? 'Upcoming customer maintenance recommendations.' : 'Recommended maintenance for your vehicles.'} preview={false} />
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    <RecordPanel>
      <RecordList items={items} pagination={pagination}
        loading={loading && <Stack alignItems="center" sx={{ py: 6 }}><CircularProgress size={28} /></Stack>}
        empty="No maintenance reminders yet.">
        {item => <RecordCard key={item._id} entityType="service">
          <Box className="record-card-copy">
            <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{vehicleText(item.vehicle)}</Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{admin ? `${item.client?.fullName || 'Client unavailable'} · ` : ''}{item.service?.name || 'Service unavailable'}</Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Recommended · {recommendation(item)}</Typography>
          </Box>
          <RecordActions statuses={<StatusBadge label={item.displayStatus || item.status} sx={{ textTransform: 'capitalize', ...colors[item.displayStatus || item.status] }} />}>
            <DetailsButton onClick={() => setSelectedId(String(item._id))}>Details</DetailsButton>
            {!admin && canBook(item) && <Button size="small" component={Link} to={bookPath(item)}>Book Service</Button>}
          </RecordActions>
        </RecordCard>}
      </RecordList>
    </RecordPanel>
    <DetailDialog open={Boolean(selected)} onClose={() => setSelectedId(null)} title="Maintenance details" reference={selected?.vehicle?.plateNumber}
      status={selected && <StatusBadge size="small" label={selected.displayStatus || selected.status} sx={{ textTransform: 'capitalize', ...colors[selected.displayStatus || selected.status] }} />}>
      {selected && <>
        <DetailGrid>
          <DetailSection title="Vehicle"><DetailVehicle vehicle={selected.vehicle} /></DetailSection>
          <DetailSection title="Service"><DetailInfo items={[["Recommended service", selected.service?.name], ...(admin ? [["Client", selected.client?.fullName]] : [])]} /></DetailSection>
        </DetailGrid>
        <DetailSection title="Maintenance information" summary><DetailInfo items={[["Last service", dateText(selected.lastServiceDate)], ["Recommended", recommendation(selected)]]} /></DetailSection>
        {!admin && canBook(selected) && <Button component={Link} to={bookPath(selected)}>Book Service</Button>}
      </>}
    </DetailDialog>
  </>
}
