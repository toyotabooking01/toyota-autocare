import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar, Box, Divider, ListItemIcon, ListItemText, Menu, MenuItem, Typography } from '@mui/material'
import KeyboardArrowDownRounded from '@mui/icons-material/KeyboardArrowDownRounded'
import PersonOutlineRounded from '@mui/icons-material/PersonOutlineRounded'
import SettingsOutlined from '@mui/icons-material/SettingsOutlined'
import HelpOutlineRounded from '@mui/icons-material/HelpOutlineRounded'
import LogoutRounded from '@mui/icons-material/LogoutRounded'
import { useAuth } from '../auth/AuthContext'
import { useConfirmation } from './ConfirmationContext'
import { roleLabels } from '../app/navigation'
import { userInitials } from '../utils/userInitials'

export default function ProfileMenu({ role }) {
  const { user, logout } = useAuth()
  const confirm = useConfirmation()
  const navigate = useNavigate()
  const [anchor, setAnchor] = useState(null)
  const close = () => setAnchor(null)
  function go(path) { close(); navigate(`/${role}/${path}`) }
  function signOut() {
    close()
    confirm({ title: 'Sign out?', message: 'Are you sure you want to sign out of your account?', cancelLabel: 'Cancel', confirmLabel: 'Sign out' }, () => {
      logout()
      navigate('/login', { replace: true })
    })
  }
  const avatar = <Avatar sx={{ width: 35, height: 35, bgcolor: 'var(--avatar-fill)', color: 'var(--avatar-ink)', fontSize: 12 }}>{userInitials(user.fullName)}</Avatar>
  return <>
    <Box component="button" type="button" aria-label={`${user.fullName}, ${roleLabels[role]}. Open profile menu`} aria-haspopup="menu" aria-expanded={Boolean(anchor)}
      onClick={event => { const target = event.currentTarget; setAnchor(current => current ? null : target) }}
      sx={{ display: 'flex', alignItems: 'center', gap: .8, minWidth: 0, maxWidth: 220, border: 0, borderRadius: 1.5, p: .5,
        color: 'text.primary', bgcolor: 'transparent', cursor: 'pointer', '&:hover': { bgcolor: 'var(--nav-hover)' },
        '&:focus-visible': { outline: '2px solid var(--line-strong)', outlineOffset: 2 } }}>
      {avatar}
      <Box sx={{ display: { xs: 'none', md: 'block' }, minWidth: 0, textAlign: 'left' }}>
        <Typography noWrap sx={{ fontSize: 12, fontWeight: 650 }}>{user.fullName}</Typography>
        <Typography sx={{ fontSize: 10, color: 'text.secondary' }}>{roleLabels[role]}</Typography>
      </Box>
      <KeyboardArrowDownRounded fontSize="small" sx={{ color: 'text.secondary', flexShrink: 0 }} />
    </Box>
    <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }} slotProps={{ paper: { sx: { mt: 1, width: 240, maxWidth: 'calc(100vw - 24px)', border: '1px solid var(--line)', boxShadow: '0 8px 24px #0002' } } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, px: 2, py: 1, minWidth: 0 }}>
        {avatar}<Box sx={{ minWidth: 0 }}><Typography noWrap sx={{ fontSize: 13, fontWeight: 650 }}>{user.fullName}</Typography>
          <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{roleLabels[role]}</Typography></Box>
      </Box>
      <Divider />
      <MenuItem onClick={() => go('profile')}><ListItemIcon><PersonOutlineRounded fontSize="small" /></ListItemIcon><ListItemText>My Profile</ListItemText></MenuItem>
      <MenuItem onClick={() => go('account-settings')}><ListItemIcon><SettingsOutlined fontSize="small" /></ListItemIcon><ListItemText>Account Settings</ListItemText></MenuItem>
      {role === 'client' && <MenuItem onClick={() => go('help-support')}><ListItemIcon><HelpOutlineRounded fontSize="small" /></ListItemIcon><ListItemText>Help &amp; Support</ListItemText></MenuItem>}
      <Divider />
      <MenuItem onClick={signOut}><ListItemIcon><LogoutRounded fontSize="small" /></ListItemIcon><ListItemText>Sign out</ListItemText></MenuItem>
    </Menu>
  </>
}
