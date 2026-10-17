import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Alert, Box, Button, CircularProgress, InputAdornment, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { DetailsButton } from '../components/RowActions'
import { MinimalStatus } from '../components/StatusChip'
import { DetailDialog, DetailGrid, DetailInfo, DetailSection, DetailVehicle } from '../components/RecordDetails'
import { PageHeading } from '../components/DashboardParts'
import RecordList, { RecordCard, RecordActions, RecordPanel } from '../components/RecordList'
import useCatalog from './useCatalog'
import { dateText, vehicleText } from './maintenanceDisplay'
import { Search } from 'iconoir-react'
import { QuietDetailsButton } from '../components/RowActions'

function statusLabel(item) {
  const status = item.displayStatus || item.status
  return { upcoming: 'Upcoming', due: 'Due', completed: 'Completed', dismissed: 'Dismissed' }[status]
    || String(status || 'Unknown').replaceAll('_', ' ').replace(/^\w/, character => character.toUpperCase())
}
function recommendation(item, compact = false) {
  return [item.nextRecommendedServiceDate && (compact ? dateText(item.nextRecommendedServiceDate) : `Date: ${dateText(item.nextRecommendedServiceDate)}`),
    item.nextRecommendedMileage != null && `Mileage: ${Number(item.nextRecommendedMileage).toLocaleString('en-PH')} km`]
    .filter(Boolean).join(' · ') || 'Recommendation unavailable'
}
function bookPath(item) { return `/client/book-service?vehicle=${item.vehicle?._id}&service=${item.service?._id}` }
function canBook(item) { return item.service?._id && item.vehicle?._id && item.vehicle.isArchived !== true && item.service.isActive !== false && item.service.isArchived !== true }

export default function MaintenanceReminders({ role }) {
  const [searchParams] = useSearchParams()
  const admin = role === 'admin'
  const client = role === 'client'
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [order, setOrder] = useState('newest')
  const endpoint = client ? `/maintenance-reminders?order=${order}` : '/maintenance-reminders'
  const { items, loading, error, setError, pagination } = useCatalog(endpoint, { search: admin || client ? search : '', status: admin || client ? status : '' }, admin || client)
  const [selectedId, setSelectedId] = useState(searchParams.get('open'))
  const selected = items.find(item => String(item._id) === selectedId)
  return <>
    <PageHeading title={admin ? 'Reminders' : 'Maintenance Reminders'} subtitle={admin ? 'Upcoming customer maintenance recommendations.' : 'Recommended maintenance for your vehicles.'} preview={false} />
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    <RecordPanel className={admin || client ? `reminder-workspace admin-list-surface${client ? ' client-reminder-workspace' : ''}` : undefined}>
      {(admin || client) && <Box className={`archive-toolbar reminder-toolbar admin-list-toolbar${client ? ' client-list-toolbar' : ''}`}>
        <TextField className={client ? 'client-list-search' : 'archive-search'} placeholder={client ? 'Search vehicle, plate, or service...' : 'Search vehicle, plate, customer or service'} aria-label="Search reminders" size="small" value={search}
          onChange={event => setSearch(event.target.value)} slotProps={{ htmlInput: { maxLength: 100, 'aria-label': 'Search reminders' }, input: client ? { startAdornment: <InputAdornment position="start"><Search width={17} height={17} strokeWidth={1.7} /></InputAdornment> } : undefined }} />
        <TextField select size="small" label="Status" value={status || 'all'} onChange={event => setStatus(event.target.value === 'all' ? '' : event.target.value)}>
          <MenuItem value="all">All statuses</MenuItem><MenuItem value="upcoming">Upcoming</MenuItem>
          <MenuItem value="due">Due</MenuItem><MenuItem value="completed">Completed</MenuItem><MenuItem value="dismissed">Dismissed</MenuItem>
        </TextField>
        {client && <TextField select size="small" label="Date order" value={order} onChange={event => setOrder(event.target.value)}><MenuItem value="newest">Newest first</MenuItem><MenuItem value="oldest">Oldest first</MenuItem></TextField>}
      </Box>}
      {admin && <Box className="reminder-header admin-list-header" aria-hidden="true"><span>Vehicle / Customer</span><span>Service</span><span>Recommended</span><span>Status</span><span>Details</span></Box>}
      {client && <Box className="client-reminder-header admin-list-header" aria-hidden="true"><span>Vehicle</span><span>Service</span><span>Recommended</span><span>Status</span><span>Action</span></Box>}
      <RecordList className={admin || client ? 'reminder-list' : ''} items={items} pagination={pagination} selectionKey={`${search}/${status}/${order}`}
        loading={loading && <Stack alignItems="center" sx={{ py: 6 }}><CircularProgress size={28} /></Stack>}
        empty={admin || client ? 'No maintenance reminders found.' : 'No maintenance reminders yet.'}>
        {item => admin ? <Box component="article" key={item._id} className="reminder-row admin-list-row">
          <Box className="reminder-vehicle"><Typography>{vehicleText(item.vehicle)}</Typography><Typography>{item.client?.fullName || 'Client unavailable'}</Typography></Box>
          <Typography className="reminder-service">{item.service?.name || 'Service unavailable'}</Typography>
          <Typography className="reminder-recommendation">{recommendation(item)}</Typography>
          <Box className="reminder-status"><MinimalStatus label={statusLabel(item)} status={item.displayStatus || item.status} /></Box>
          <DetailsButton className="reminder-details admin-list-details" onClick={() => setSelectedId(String(item._id))}>Details</DetailsButton>
        </Box> : client ? <Box component="article" key={item._id} className="client-reminder-row admin-list-row">
          <Box><Typography className="client-reminder-vehicle">{vehicleText(item.vehicle)}</Typography><Typography className="client-reminder-meta">{item.vehicle?.plateNumber || 'Plate unavailable'}</Typography></Box>
          <Typography>{item.service?.name || 'Service unavailable'}</Typography><Typography>{recommendation(item, true)}</Typography>
          <MinimalStatus label={statusLabel(item)} status={item.displayStatus || item.status} />
          <QuietDetailsButton onClick={() => setSelectedId(String(item._id))} />
        </Box> : <RecordCard key={item._id} entityType="service">
          <Box className="record-card-copy">
            <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{vehicleText(item.vehicle)}</Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{admin ? `${item.client?.fullName || 'Client unavailable'} · ` : ''}{item.service?.name || 'Service unavailable'}</Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Recommended · {recommendation(item)}</Typography>
          </Box>
          <RecordActions statuses={<MinimalStatus label={statusLabel(item)} status={item.displayStatus || item.status} />}>
            <DetailsButton onClick={() => setSelectedId(String(item._id))}>Details</DetailsButton>
            {!admin && canBook(item) && <Button size="small" component={Link} to={bookPath(item)}>Book Service</Button>}
          </RecordActions>
        </RecordCard>}
      </RecordList>
    </RecordPanel>
    <DetailDialog open={Boolean(selected)} onClose={() => setSelectedId(null)} title={client ? 'Maintenance Details' : 'Maintenance details'} reference={selected?.vehicle?.plateNumber}
      status={selected && <MinimalStatus label={statusLabel(selected)} status={selected.displayStatus || selected.status} />}
      actions={!admin && selected && canBook(selected) && <Button component={Link} to={bookPath(selected)} variant="contained">Book Service</Button>}>
      {selected && <DetailGrid>
        <DetailSection title={client ? 'Vehicle information' : 'Vehicle'}><DetailVehicle vehicle={selected.vehicle} /></DetailSection>
        <DetailSection title="Maintenance information"><DetailInfo items={[
          ['Recommended service', selected.service?.name],
          ['Recommended date', selected.nextRecommendedServiceDate ? dateText(selected.nextRecommendedServiceDate) : 'Date unavailable'],
          ['Current status', <MinimalStatus label={statusLabel(selected)} status={selected.displayStatus || selected.status} />],
          ['Last service', dateText(selected.lastServiceDate)],
          ...(admin ? [['Client', selected.client?.fullName]] : []),
        ]} /></DetailSection>
      </DetailGrid>}
    </DetailDialog>
  </>
}
