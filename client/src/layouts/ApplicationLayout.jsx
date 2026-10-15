import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AppBar, Box, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Stack, Toolbar, Typography, useMediaQuery } from '@mui/material'
import MenuRounded from '@mui/icons-material/MenuRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import SearchRounded from '@mui/icons-material/SearchRounded'
import { Autocomplete, TextField, InputAdornment } from '@mui/material'
import BrandMark from '../components/BrandMark'
import ProfileMenu from '../components/ProfileMenu'
import NotificationBell from '../components/NotificationBell'
import { roleLabels, roleNavigation } from '../app/navigation'
import { workspaceSidebarWidth, workspaceTopbarHeight } from './workspaceDimensions'
import WorkspaceContainer from './WorkspaceContainer'

const sidebarWidth = workspaceSidebarWidth
export default function ApplicationLayout({ role }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const desktop = useMediaQuery(theme => theme.breakpoints.up('lg'))
  const menu = roleNavigation[role]
  const current = menu.find(item => pathname === `/${role}/${item.path}`)?.label
    || ({ profile: 'My Profile', 'account-settings': 'Account Settings', 'help-support': 'Help & Support', notifications: 'Notifications' }[pathname.split('/')[2]])
    || 'Dashboard'
  const navigation = <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
    <Stack direction="row" sx={{ px: 2.25, minHeight: 72, alignItems: 'center', justifyContent: 'space-between' }}>
      <Typography component={Link} to={`/${role}/dashboard`} onClick={() => setOpen(false)} className="workspace-brand" sx={{ fontWeight: 700, fontSize: 19, letterSpacing: -.7, color: 'text.primary', textDecoration: 'none', '&:hover': { textDecoration: 'none' } }}>
        <BrandMark className="workspace-brand-mark" /><Box component="span" className="workspace-brand-toyota">Toyota</Box> AutoCare
      </Typography>
      {!desktop && <IconButton aria-label="Close navigation" onClick={() => setOpen(false)}><CloseRounded /></IconButton>}
    </Stack>
    <Typography variant="overline" sx={{ px: 3, pt: 2, pb: .5, color: 'text.secondary', fontSize: 10, letterSpacing: 1.7 }}>{roleLabels[role]} workspace</Typography>
    <Box component="nav" aria-label={`${roleLabels[role]} navigation`} sx={{ flex: 1, overflowY: 'auto', px: 1.5, pb: 2 }}>
      <List disablePadding>{menu.map(({ path, label, icon: Icon }) => <ListItemButton
        key={path} component={NavLink} to={`/${role}/${path}`} end onClick={() => setOpen(false)}
        sx={{ borderRadius: 1.5, mb: .4, minHeight: 46, py: .5,
          '&:hover': { textDecoration: 'none', bgcolor: 'var(--nav-hover)' },
          '&.active': { color: 'var(--nav-active-ink)', bgcolor: 'var(--nav-active)', fontWeight: 650, '& .MuiListItemIcon-root': { color: 'var(--nav-active-ink)' } } }}>
        <ListItemIcon sx={{ minWidth: 34, color: 'var(--muted)' }}><Icon sx={{ fontSize: 20 }} /></ListItemIcon>
        <ListItemText primary={label} slotProps={{ primary: { fontSize: 13, fontWeight: 550 } }} />
      </ListItemButton>)}</List>
    </Box>
  </Box>
  return <Box className="workspace-shell" sx={{ minHeight: '100dvh', display: 'flex', width: '100%' }}>
    <Box component="a" href="#workspace-content" sx={{ position: 'fixed', left: 16, top: -80, zIndex: 1500, p: 1.5, bgcolor: 'var(--surface)', '&:focus': { top: 10 } }}>Skip to content</Box>
    <Drawer variant={desktop ? 'permanent' : 'temporary'} open={desktop || open} onClose={() => setOpen(false)} slotProps={{ paper: { className: 'workspace-sidebar' } }}
      sx={{ width: desktop ? sidebarWidth : 0, flexShrink: 0, '& .MuiDrawer-paper': { width: desktop ? sidebarWidth : 260, maxWidth: '90vw', boxSizing: 'border-box', borderRight: '1px solid var(--line)' } }}>
      {navigation}
    </Drawer>
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <AppBar position="sticky" elevation={0} color="inherit" sx={{ borderBottom: '1px solid var(--line)' }}>
        <Toolbar sx={{ minHeight: workspaceTopbarHeight, gap: 1.5, px: { xs: 2, md: 3.5 } }}>
          {!desktop && <IconButton edge="start" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}><MenuRounded /></IconButton>}
          <Autocomplete className="workspace-search" options={menu} value={null} blurOnSelect onChange={(_, option) => { if (option) navigate(`/${role}/${option.path}`) }}
            getOptionLabel={option => option.label} isOptionEqualToValue={(a, b) => a.path === b.path} sx={{ flex: '1 1 240px', minWidth: 0, maxWidth: 430, display: { xs: 'none', sm: 'block' } }}
            renderInput={params => <TextField {...params} size="small" placeholder="Find a workspace page…" aria-label="Find a workspace page"
              slotProps={{ input: { ...params.InputProps, startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }, htmlInput: { ...params.inputProps, 'aria-label': 'Find a workspace page' } }} />} />
          <Typography sx={{ fontSize: 13, color: 'text.secondary', flex: 1, minWidth: 0, overflowWrap: 'anywhere', display: { sm: 'none' } }}>{current}</Typography>
          <Box sx={{ flex: 1, display: { xs: 'none', sm: 'block' } }} />
          <NotificationBell role={role} />
          <ProfileMenu role={role} />
        </Toolbar>
      </AppBar>
      <WorkspaceContainer>
        <Outlet />
      </WorkspaceContainer>
    </Box>
  </Box>
}
