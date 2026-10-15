import { DetailsButton } from '../components/RowActions'
import { StatusBadge } from '../components/StatusChip'
import { useState } from 'react'
import { Alert, Box, CircularProgress, Stack, Typography } from '@mui/material'
import { DetailDialog, DetailGrid, DetailInfo, DetailSection, DetailVehicle } from '../components/RecordDetails'
import { PageHeading } from '../components/DashboardParts'
import useCatalog from './useCatalog'
import RecordList, { RecordCard, RecordActions, RecordPanel } from '../components/RecordList'
import { dateText, vehicleText } from './maintenanceDisplay'
import { useSearchParams } from 'react-router-dom'

const reminderColors = {
  pending: { bgcolor: 'var(--amber-soft)', color: 'var(--amber-ink)' },
  sent: { bgcolor: 'var(--blue-soft)', color: 'var(--blue-ink)' },
  dismissed: { bgcolor: 'var(--surface-soft)', color: 'var(--muted)' },
  completed: { bgcolor: 'var(--green-soft)', color: 'var(--green-ink)' },
}

export default function MaintenanceReminders({ role }) {
  const [searchParams] = useSearchParams()
  const openId = searchParams.get('open')
  const admin = role === 'admin'
  const { items, loading, error, setError, pagination } = useCatalog('/maintenance-reminders', {}, admin)
  const [selectedId, setSelectedId] = useState(openId)
  const selected = items.find(item => String(item._id) === selectedId) || null
  return <>
    <PageHeading title={admin ? 'Reminders' : 'Maintenance'} subtitle={admin ? 'Upcoming maintenance recommendations for customers.' : 'Recommended next service dates for your vehicles.'} preview={false} />
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    <RecordPanel>
      <RecordList items={items} pagination={pagination}
        loading={loading && <Stack alignItems="center" sx={{ py: 6 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 1 }}>Loading maintenance…</Typography></Stack>}
        empty="No maintenance recommendations yet. Recommendations appear after a service with a configured interval is completed.">
        {item => <RecordCard key={item._id} entityType="service">
          <Box className="record-card-copy"><Typography sx={{ fontSize: 14, fontWeight: 700 }}>{vehicleText(item.vehicle)}</Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{admin ? `${item.client?.fullName || 'Client unavailable'} · ` : ''}{item.service?.name || 'Service unavailable'}</Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Last service: {dateText(item.lastServiceDate)} · Next recommended: {dateText(item.nextRecommendedServiceDate)}</Typography>
          </Box><RecordActions statuses={<StatusBadge label={item.status.replace('_', ' ')} sx={{ textTransform: 'capitalize', ...reminderColors[item.status] }} />}><DetailsButton onClick={() => setSelectedId(String(item._id))}>Details</DetailsButton></RecordActions>
        </RecordCard>}
      </RecordList>
    </RecordPanel>
    <DetailDialog open={Boolean(selected)} onClose={() => setSelectedId(null)} title="Maintenance details" reference={selected?._id}
      status={selected && <StatusBadge size="small" label={selected.status.replace('_', ' ')} sx={{ textTransform: 'capitalize', ...reminderColors[selected.status] }} />}>
      {selected && <>
        <DetailGrid><DetailSection title="Vehicle"><DetailVehicle vehicle={selected.vehicle} /></DetailSection>
          <DetailSection title="Service"><DetailInfo items={[["Recommended service", selected.service?.name], ...(admin ? [['Client', selected.client?.fullName]] : [])]} /></DetailSection></DetailGrid>
        <DetailSection title="Maintenance information" summary><DetailInfo items={[["Last service", dateText(selected.lastServiceDate)], ["Next recommended service", dateText(selected.nextRecommendedServiceDate)]]} /></DetailSection>
      </>}
    </DetailDialog>
  </>
}
