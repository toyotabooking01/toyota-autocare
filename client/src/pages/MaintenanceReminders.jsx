import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Alert, Box, Button, CircularProgress, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { DetailsButton } from '../components/RowActions'
import { MinimalStatus, StatusBadge } from '../components/StatusChip'
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
function statusLabel(item) {
  const status = item.displayStatus || item.status
  return { upcoming: 'Upcoming', due: 'Due', completed: 'Completed', dismissed: 'Dismissed' }[status]
    || String(status || 'Unknown').replaceAll('_', ' ').replace(/^\w/, character => character.toUpperCase())
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
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const { items, loading, error, setError, pagination } = useCatalog('/maintenance-reminders', { search: admin ? search : '', status: admin ? status : '' }, admin)
  const [selectedId, setSelectedId] = useState(searchParams.get('open'))
  const selected = items.find(item => String(item._id) === selectedId)
  return <>
    <PageHeading title={admin ? 'Reminders' : 'Maintenance Reminders'} subtitle={admin ? 'Upcoming customer maintenance recommendations.' : 'Recommended maintenance for your vehicles.'} preview={false} />
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    <RecordPanel className={admin ? 'reminder-workspace admin-list-surface' : undefined}>
      {admin && <Box className="archive-toolbar reminder-toolbar admin-list-toolbar">
        <TextField className="archive-search" placeholder="Search vehicle, plate, customer or service" aria-label="Search reminders" size="small" value={search}
          onChange={event => setSearch(event.target.value)} slotProps={{ htmlInput: { maxLength: 100 } }} />
        <TextField select size="small" label="Status" value={status || 'all'} onChange={event => setStatus(event.target.value === 'all' ? '' : event.target.value)}>
          <MenuItem value="all">All statuses</MenuItem><MenuItem value="upcoming">Upcoming</MenuItem>
          <MenuItem value="due">Due</MenuItem><MenuItem value="completed">Completed</MenuItem><MenuItem value="dismissed">Dismissed</MenuItem>
        </TextField>
      </Box>}
      {admin && <Box className="reminder-header admin-list-header" aria-hidden="true"><span>Vehicle / Customer</span><span>Service</span><span>Recommended</span><span>Status</span><span>Details</span></Box>}
      <RecordList className={admin ? 'reminder-list' : ''} items={items} pagination={pagination}
        loading={loading && <Stack alignItems="center" sx={{ py: 6 }}><CircularProgress size={28} /></Stack>}
        empty={admin ? 'No reminders found.' : 'No maintenance reminders yet.'}>
        {item => admin ? <Box component="article" key={item._id} className="reminder-row admin-list-row">
          <Box className="reminder-vehicle"><Typography>{vehicleText(item.vehicle)}</Typography><Typography>{item.client?.fullName || 'Client unavailable'}</Typography></Box>
          <Typography className="reminder-service">{item.service?.name || 'Service unavailable'}</Typography>
          <Typography className="reminder-recommendation">{recommendation(item)}</Typography>
          <Box className="reminder-status"><MinimalStatus label={statusLabel(item)} status={item.displayStatus || item.status} /></Box>
          <DetailsButton className="reminder-details admin-list-details" onClick={() => setSelectedId(String(item._id))}>Details</DetailsButton>
        </Box> : <RecordCard key={item._id} entityType="service">
          <Box className="record-card-copy">
            <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{vehicleText(item.vehicle)}</Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{admin ? `${item.client?.fullName || 'Client unavailable'} · ` : ''}{item.service?.name || 'Service unavailable'}</Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Recommended · {recommendation(item)}</Typography>
          </Box>
          <RecordActions statuses={admin
            ? <MinimalStatus label={statusLabel(item)} status={item.displayStatus || item.status} />
            : <StatusBadge label={item.displayStatus || item.status} sx={{ textTransform: 'capitalize', ...colors[item.displayStatus || item.status] }} />}>
            <DetailsButton onClick={() => setSelectedId(String(item._id))}>Details</DetailsButton>
            {!admin && canBook(item) && <Button size="small" component={Link} to={bookPath(item)}>Book Service</Button>}
          </RecordActions>
        </RecordCard>}
      </RecordList>
    </RecordPanel>
    <DetailDialog open={Boolean(selected)} onClose={() => setSelectedId(null)} title="Maintenance details" reference={selected?.vehicle?.plateNumber}
      status={selected && (admin
        ? <MinimalStatus label={statusLabel(selected)} status={selected.displayStatus || selected.status} />
        : <StatusBadge size="small" label={selected.displayStatus || selected.status} sx={{ textTransform: 'capitalize', ...colors[selected.displayStatus || selected.status] }} />)}>
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
