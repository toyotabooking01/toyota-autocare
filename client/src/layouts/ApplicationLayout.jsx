import { useConfirmation } from '../components/ConfirmationContext'
import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AppBar, Avatar, Box, Button, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Stack, Toolbar, Typography, useMediaQuery } from '@mui/material'
import MenuRounded from '@mui/icons-material/MenuRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import LogoutRounded from '@mui/icons-material/LogoutRounded'
import NotificationsNoneRounded from '@mui/icons-material/NotificationsNoneRounded'
import SearchRounded from '@mui/icons-material/SearchRounded'
import { Autocomplete, TextField, InputAdornment } from '@mui/material'
import ThemeToggle from '../components/ThemeToggle'
import { useAuth } from '../auth/AuthContext'
import { roleLabels, roleNavigation } from '../app/navigation'

const sidebarWidth = 236
export default function ApplicationLayout({ role }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const confirm = useConfirmation()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const desktop = useMediaQuery(theme => theme.breakpoints.up('lg'))
  const menu = roleNavigation[role]
  const current = menu.find(item => pathname === `/${role}/${item.path}`)?.label || 'Dashboard'
  const initials = user.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('')
  function signOut() { confirm('Are you sure you want to log out?', () => { setOpen(false); logout() }) }
  const navigation = <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
    <Stack direction="row" sx={{ px: 2.5, minHeight: 76, alignItems: 'center', justifyContent: 'space-between' }}>
      <Typography component={Link} to={`/${role}/dashboard`} onClick={() => setOpen(false)} sx={{ fontWeight: 800, fontSize: 21, letterSpacing: -.8, color: 'text.primary', textDecoration: 'none', '&:hover': { textDecoration: 'none' } }}>
        <Box component="span" sx={{ color: 'primary.main' }}>Toyota</Box> AutoCare
      </Typography>
      {!desktop && <IconButton aria-label="Close navigation" onClick={() => setOpen(false)}><CloseRounded /></IconButton>}
    </Stack>
    <Divider />
    <Typography variant="overline" sx={{ px: 3, pt: 2, pb: .5, color: 'text.secondary', fontSize: 10, letterSpacing: 1.7 }}>{roleLabels[role]} workspace</Typography>
    <Box component="nav" aria-label={`${roleLabels[role]} navigation`} sx={{ flex: 1, overflowY: 'auto', px: 1.5, pb: 2 }}>
      <List disablePadding>{menu.map(({ path, label, icon: Icon }) => <ListItemButton
        key={path} component={NavLink} to={`/${role}/${path}`} end onClick={() => setOpen(false)}
        sx={{ borderRadius: 1.5, mb: .4, minHeight: 42, py: .5, borderLeft: '2px solid transparent',
          '&:hover': { textDecoration: 'none', bgcolor: 'var(--surface-soft)' },
          '&.active': { color: 'primary.main', bgcolor: 'var(--accent-soft)', borderLeftColor: 'primary.main', '& .MuiListItemIcon-root': { color: 'primary.main' } } }}>
        <ListItemIcon sx={{ minWidth: 34, color: 'var(--muted)' }}><Icon sx={{ fontSize: 20 }} /></ListItemIcon>
        <ListItemText primary={label} slotProps={{ primary: { fontSize: 13, fontWeight: 550 } }} />
      </ListItemButton>)}</List>
    </Box>
    <Divider /><Button onClick={signOut} startIcon={<LogoutRounded />} sx={{ m: 1.5, justifyContent: 'flex-start', color: 'text.secondary' }}>Sign out</Button>
  </Box>
  return <Box className="workspace-shell" sx={{ minHeight: '100dvh', bgcolor: 'background.default', display: 'flex', width: '100%' }}>
    <Box component="a" href="#workspace-content" sx={{ position: 'fixed', left: 16, top: -80, zIndex: 1500, p: 1.5, bgcolor: 'var(--surface)', '&:focus': { top: 10 } }}>Skip to content</Box>
    <Drawer variant={desktop ? 'permanent' : 'temporary'} open={desktop || open} onClose={() => setOpen(false)}
      sx={{ width: desktop ? sidebarWidth : 0, flexShrink: 0, '& .MuiDrawer-paper': { width: desktop ? sidebarWidth : 260, maxWidth: '90vw', boxSizing: 'border-box', borderRight: '1px solid var(--line)' } }}>
      {navigation}
    </Drawer>
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <AppBar position="sticky" elevation={0} color="inherit" sx={{ bgcolor: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
        <Toolbar sx={{ minHeight: { xs: 68, sm: 76 }, gap: 1.5, px: { xs: 2, md: 3.5 } }}>
          {!desktop && <IconButton edge="start" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}><MenuRounded /></IconButton>}
          <Autocomplete options={menu} value={null} blurOnSelect onChange={(_, option) => { if (option) navigate(`/${role}/${option.path}`) }}
            getOptionLabel={option => option.label} isOptionEqualToValue={(a, b) => a.path === b.path} sx={{ flex: '1 1 240px', minWidth: 0, maxWidth: 430, display: { xs: 'none', sm: 'block' } }}
            renderInput={params => <TextField {...params} size="small" placeholder="Find a workspace page…" aria-label="Find a workspace page"
              slotProps={{ input: { ...params.InputProps, startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }, htmlInput: { ...params.inputProps, 'aria-label': 'Find a workspace page' } }} />} />
          <Typography sx={{ fontSize: 13, color: 'text.secondary', flex: 1, minWidth: 0, overflowWrap: 'anywhere', display: { sm: 'none' } }}>{current}</Typography>
          <Box sx={{ flex: 1, display: { xs: 'none', sm: 'block' } }} />
          <ThemeToggle />
          {role === 'client' && <IconButton component={Link} to="/client/notifications" aria-label="View notifications"><NotificationsNoneRounded /></IconButton>}
          <Avatar sx={{ width: 35, height: 35, bgcolor: '#354254', color: '#fff', fontSize: 12 }}>{initials}</Avatar>
          <Box sx={{ display: { xs: 'none', md: 'block' }, minWidth: 0, maxWidth: 180 }}>
            <Typography noWrap sx={{ fontSize: 12, fontWeight: 650 }}>{user.fullName}</Typography>
            <Typography sx={{ fontSize: 10, color: 'text.secondary' }}>{roleLabels[role]}</Typography>
          </Box>
        </Toolbar>
      </AppBar>
      <Box component="main" id="workspace-content" tabIndex={-1} sx={{ p: { xs: 2, sm: 3, xl: 4 }, outline: 'none' }}>
        <Outlet />
      </Box>
    </Box>
  </Box>
}
