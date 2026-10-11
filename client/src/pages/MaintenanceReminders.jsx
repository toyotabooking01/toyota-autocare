import { Alert, Box, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material'
import { PageHeading } from '../components/DashboardParts'
import useCatalog from './useCatalog'
import ListPagination from '../components/ListPagination'
import { dateText, vehicleText } from './maintenanceDisplay'

const reminderColors = {
  pending: { bgcolor: 'var(--amber-soft)', color: 'var(--amber-ink)' },
  sent: { bgcolor: 'var(--blue-soft)', color: 'var(--blue-ink)' },
  dismissed: { bgcolor: 'var(--surface-soft)', color: 'var(--muted)' },
  completed: { bgcolor: 'var(--green-soft)', color: 'var(--green-ink)' },
}

export default function MaintenanceReminders({ role }) {
  const admin = role === 'admin'
  const { items, loading, error, setError, pagination } = useCatalog('/maintenance-reminders', {}, admin)
  return <>
    <PageHeading title={admin ? 'Reminders' : 'Maintenance'} subtitle={admin ? 'Upcoming maintenance recommendations for customers.' : 'Recommended next service dates for your vehicles.'} preview={false} />
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderColor: 'var(--line)', borderRadius: 2.5 }}>
      {loading ? <Stack alignItems="center" sx={{ py: 6 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 1 }}>Loading maintenance…</Typography></Stack>
        : !items.length ? <Typography sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>No maintenance recommendations yet. Recommendations appear after a service with a configured interval is completed.</Typography>
          : <Stack spacing={1}>{items.map(item => <Box key={item._id} sx={{ p: 2, border: '1px solid var(--line)', borderRadius: 2, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' }, gap: 2 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}><Typography sx={{ fontSize: 14, fontWeight: 700 }}>{vehicleText(item.vehicle)}</Typography>
              {admin && <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{item.client?.fullName || 'Client unavailable'}</Typography>}
              <Typography sx={{ fontSize: 13, mt: .5 }}>{item.service?.name || 'Service unavailable'}</Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: .5 }}>Last service: {dateText(item.lastServiceDate)} · Next recommended: {dateText(item.nextRecommendedServiceDate)}</Typography>
            </Box><Chip size="small" label={item.status.replace('_', ' ')} sx={{ textTransform: 'capitalize', ...reminderColors[item.status] }} />
          </Box>)}</Stack>}
      <ListPagination pagination={pagination} />
    </Paper>
  </>
}
