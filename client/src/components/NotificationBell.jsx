import { useEffect, useId, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Alert, Badge, Box, Button, CircularProgress, IconButton, ListItemButton, Popover, Stack, Typography } from '@mui/material'
import NotificationsNoneRounded from '@mui/icons-material/NotificationsNoneRounded'
import api from '../services/api'
import { NOTIFICATIONS_UPDATED } from '../utils/notificationEvents'
import { notificationDestination, notificationTime } from '../utils/notificationDisplay'
import { friendlyError } from '../utils/friendlyErrors'

export default function NotificationBell({ role }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const id = useId()
  const [anchor, setAnchor] = useState(null)
  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const mutation = useRef(false)
  const open = Boolean(anchor)
  useEffect(() => {
    let live = true
    let latest = 0
    async function refresh() {
      const request = ++latest
      try {
        const { data } = await api.get('/notifications/unread-count')
        if (live && request === latest) setUnread(Number.isFinite(data.count) ? data.count : 0)
      } catch { /* Keep the last known indicator if the count request fails. */ }
    }
    function updated() { refresh(); setRevision(value => value + 1) }
    refresh()
    window.addEventListener(NOTIFICATIONS_UPDATED, updated)
    return () => { live = false; window.removeEventListener(NOTIFICATIONS_UPDATED, updated) }
  }, [pathname, role])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    api.get('/notifications', { signal: controller.signal })
      .then(({ data }) => {
        if (!controller.signal.aborted) { setItems(Array.isArray(data.items) ? data.items.slice(0, 10) : []); setError('') }
      })
      .catch(requestError => { if (!controller.signal.aborted) setError(friendlyError(requestError)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [open, revision, role])

  function toggle(event) {
    if (open) setAnchor(null)
    else { setLoading(true); setError(''); setAnchor(event.currentTarget) }
  }
  async function read(item) {
    if (mutation.current) return
    mutation.current = true; setBusy(true); setError('')
    try {
      if (!item.isRead) {
        await api.patch(`/notifications/${item._id}/read`)
        window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED))
      }
      setAnchor(null)
      const destination = notificationDestination(item, role)
      if (destination) navigate(destination)
    } catch (requestError) { setError(friendlyError(requestError)) }
    finally { mutation.current = false; setBusy(false) }
  }
  async function readAll() {
    if (mutation.current) return
    mutation.current = true; setBusy(true); setError('')
    try {
      await api.patch('/notifications/read-all')
      setItems(current => current.map(item => ({ ...item, isRead: true })))
      setUnread(0)
      window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED))
    } catch (requestError) { setError(friendlyError(requestError)) }
    finally { mutation.current = false; setBusy(false) }
  }
  return <>
    <IconButton onClick={toggle} aria-label={unread ? `View notifications, ${unread} unread` : 'View notifications'}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      sx={{ flexShrink: 0, bgcolor: open ? 'var(--nav-active)' : undefined, borderRadius: 1, '&:hover': { bgcolor: 'var(--nav-hover)' } }}>
      <Badge badgeContent={unread} max={99} color="error" invisible={!unread} overlap="circular"><NotificationsNoneRounded /></Badge>
    </IconButton>
    <Popover open={open} anchorEl={anchor} onClose={() => setAnchor(null)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }} marginThreshold={16}
      slotProps={{ paper: { id, role: 'dialog', 'aria-labelledby': `${id}-title`, sx: theme => ({
        mt: 1, width: 400, maxWidth: 'calc(100vw - 32px)', maxHeight: 'min(540px, calc(100dvh - 100px))',
        display: 'flex', flexDirection: 'column', bgcolor: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '14px',
        boxShadow: theme.palette.mode === 'dark' ? '0 16px 48px #0008' : '0 16px 48px #11182726',
      }) } }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, px: 2, py: 1.5, flexShrink: 0, borderBottom: '1px solid var(--line)' }}>
        <Typography id={`${id}-title`} component="h2" sx={{ fontSize: 18, fontWeight: 700 }}>Notifications</Typography>
        <Button size="small" disabled={busy || loading || !unread} onClick={readAll} sx={{ fontSize: 11, minHeight: 28 }}>Mark all as read</Button>
      </Stack>
      <Box sx={{ overflowY: 'auto', minHeight: 0, p: 1 }} aria-busy={loading || busy}>
        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}<Button size="small" onClick={() => { setLoading(true); setError(''); setRevision(value => value + 1) }}>Retry</Button></Alert>}
        {loading ? <Stack alignItems="center" sx={{ py: 3 }} role="status"><CircularProgress size={24} /><Typography sx={{ mt: 1, fontSize: 12 }}>Loading notifications…</Typography></Stack>
          : !items.length && !error ? <Typography sx={{ p: 3, textAlign: 'center', fontSize: 13, color: 'text.secondary' }}>You're all caught up.</Typography>
            : items.map(item => <ListItemButton key={item._id} component="button" type="button" disabled={busy} onClick={() => read(item)}
              aria-label={`${item.title}${item.isRead ? '' : ', unread'}`} sx={{ width: '100%', minWidth: 0, alignItems: 'flex-start', textAlign: 'left', gap: 1.5,
                p: 1.5, mb: .5, borderRadius: '10px', bgcolor: item.isRead ? 'transparent' : 'var(--accent-soft)', '&:hover': { bgcolor: 'var(--nav-hover)' } }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 13, fontWeight: item.isRead ? 500 : 700, overflowWrap: 'anywhere' }}>{item.title}</Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: .4, overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.message}</Typography>
                <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: .6 }}>{notificationTime(item.createdAt)}</Typography>
              </Box>
              {!item.isRead && <Box component="span" aria-hidden="true" sx={{ width: 7, height: 7, flexShrink: 0, mt: .75, borderRadius: '50%', bgcolor: 'primary.main' }} />}
            </ListItemButton>)}
      </Box>
      <Box sx={{ px: 2, py: 1, borderTop: '1px solid var(--line)', flexShrink: 0 }}>
        <Button fullWidth size="small" onClick={() => { setAnchor(null); navigate(`/${role}/notifications`) }}>View all notifications</Button>
      </Box>
    </Popover>
  </>
}
