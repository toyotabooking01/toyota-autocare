import { DetailsButton, MoreActionsMenu } from '../components/RowActions'
import { StatusBadge } from '../components/StatusChip'
import { useEffect, useState } from 'react'
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material'
import { PageHeading } from '../components/DashboardParts'
import useCatalog, { message } from './useCatalog'
import api from '../services/api'
import { NOTIFICATIONS_UPDATED } from '../utils/notificationEvents'
import RecordList, { RecordCard, RecordActions, RecordPanel } from '../components/RecordList'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { notificationDestination } from '../utils/notificationDisplay'

function when(value) { return value ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '' }
export default function NotificationsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { items, loading, error, setError, reload } = useCatalog('/notifications', {})
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [filter, setFilter] = useState('all')
  useEffect(() => {
    const timer = window.setInterval(() => window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED)), 15000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    window.addEventListener(NOTIFICATIONS_UPDATED, reload)
    return () => window.removeEventListener(NOTIFICATIONS_UPDATED, reload)
  }, [reload])
  const unread = items.filter(item => !item.isRead).length
  const visible = filter === 'unread' ? items.filter(item => !item.isRead) : items
  async function markOne(item) {
    setSaving(true); setError('')
    try { await api.patch(`/notifications/${item._id}/read`); window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED)) }
    catch (requestError) { setError(message(requestError)) }
    finally { setSaving(false) }
  }
  async function markAll() {
    setSaving(true); setError('')
    try { await api.patch('/notifications/read-all'); setNotice('All notifications marked as read.'); window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED)) }
    catch (requestError) { setError(message(requestError)) }
    finally { setSaving(false) }
  }
  async function openNotification(item) {
    if (saving) return
    setSaving(true); setError('')
    try {
      if (!item.isRead) await api.patch(`/notifications/${item._id}/read`)
      window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED))
      const destination = notificationDestination(item, user.role)
      if (destination) navigate(destination)
    } catch (requestError) { setError(message(requestError)) }
    finally { setSaving(false) }
  }
  return <>
    <PageHeading title="Notifications" subtitle="Updates about your service visits." preview={false} />
    {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    <RecordPanel>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={1.5} sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1}><Typography sx={{ fontWeight: 700 }}>Inbox</Typography><StatusBadge size="small" label={`${unread} unread`} sx={{ bgcolor: unread ? 'var(--accent-soft)' : 'var(--surface-soft)', color: unread ? 'primary.main' : 'text.secondary' }} /></Stack>
        <Stack direction="row" spacing={1}><Button size="small" variant={filter === 'all' ? 'contained' : 'outlined'} onClick={() => setFilter('all')}>All</Button><Button size="small" variant={filter === 'unread' ? 'contained' : 'outlined'} onClick={() => setFilter('unread')}>Unread</Button></Stack>
        <Button size="small" variant="outlined" disabled={loading || saving || !unread} onClick={markAll}>Mark all as read</Button>
      </Stack>
      <RecordList items={visible} selectionKey={filter} loading={loading && <Stack alignItems="center" sx={{ py: 6 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 1 }}>Loading notifications…</Typography></Stack>} empty={filter === 'unread' ? 'No unread notifications.' : 'No notifications yet.'}>
          {item => <RecordCard key={item._id} entityType="notification" sx={{ bgcolor: item.isRead ? 'var(--surface)' : 'var(--accent-soft)' }}>
            <Box className="record-card-copy"><Typography sx={{ fontSize: 14, fontWeight: item.isRead ? 600 : 700 }}>{item.title}</Typography>
              <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: .5 }}>{item.message}</Typography><Typography sx={{ fontSize: 11, color: 'text.secondary', mt: .8 }}>{when(item.createdAt)}</Typography></Box>
            <RecordActions statuses={!item.isRead && <StatusBadge label="New" sx={{ bgcolor: 'var(--selection)', color: 'var(--selection-ink)' }} />}>
              <DetailsButton disabled={saving} onClick={() => openNotification(item)}>View</DetailsButton>
              {!item.isRead && <MoreActionsMenu label={item.title} disabled={saving} items={[{ label: 'Mark as read', onClick: () => markOne(item) }]} />}
            </RecordActions>
          </RecordCard>}
      </RecordList>
    </RecordPanel>
  </>
}
