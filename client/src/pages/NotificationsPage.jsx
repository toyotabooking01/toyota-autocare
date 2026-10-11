import { useState } from 'react'
import { Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material'
import { PageHeading } from '../components/DashboardParts'
import useCatalog, { message } from './useCatalog'
import api from '../services/api'

function when(value) { return value ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '' }
export default function NotificationsPage() {
  const { items, loading, error, setError, reload } = useCatalog('/notifications', {})
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const unread = items.filter(item => !item.isRead).length
  async function markOne(item) {
    setSaving(true); setError('')
    try { await api.patch(`/notifications/${item._id}/read`); reload() }
    catch (requestError) { setError(message(requestError)) }
    finally { setSaving(false) }
  }
  async function markAll() {
    setSaving(true); setError('')
    try { await api.patch('/notifications/read-all'); setNotice('All notifications marked as read.'); reload() }
    catch (requestError) { setError(message(requestError)) }
    finally { setSaving(false) }
  }
  return <>
    <PageHeading title="Notifications" subtitle="Updates about your service visits." preview={false} />
    {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderColor: 'var(--line)', borderRadius: 2.5 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={1.5} sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1}><Typography sx={{ fontWeight: 700 }}>Inbox</Typography><Chip size="small" label={`${unread} unread`} sx={{ bgcolor: unread ? 'var(--accent-soft)' : 'var(--surface-soft)', color: unread ? 'primary.main' : 'text.secondary' }} /></Stack>
        <Button size="small" variant="outlined" disabled={loading || saving || !unread} onClick={markAll}>Mark all as read</Button>
      </Stack>
      {loading ? <Stack alignItems="center" sx={{ py: 6 }} role="status"><CircularProgress size={28} /><Typography sx={{ mt: 1 }}>Loading notifications…</Typography></Stack>
        : !items.length ? <Typography sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>No notifications yet.</Typography>
          : <Stack spacing={1}>{items.map(item => <Box key={item._id} sx={{ p: 2, border: '1px solid var(--line)', borderRadius: 2, bgcolor: item.isRead ? 'var(--surface)' : 'var(--accent-soft)', display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, alignItems: { sm: 'center' } }}>
            <Box sx={{ flex: 1, minWidth: 0 }}><Stack direction="row" alignItems="center" spacing={1}><Typography sx={{ fontSize: 14, fontWeight: item.isRead ? 600 : 750 }}>{item.title}</Typography>{!item.isRead && <Chip size="small" label="New" sx={{ height: 20, bgcolor: 'var(--accent-soft)', color: 'primary.main' }} />}</Stack>
              <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: .5 }}>{item.message}</Typography><Typography sx={{ fontSize: 11, color: 'text.secondary', mt: .8 }}>{when(item.createdAt)}</Typography></Box>
            {!item.isRead && <Button size="small" disabled={saving} onClick={() => markOne(item)}>Mark as read</Button>}
          </Box>)}</Stack>}
    </Paper>
  </>
}
