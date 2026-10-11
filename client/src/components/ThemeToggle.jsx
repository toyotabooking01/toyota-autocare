import { Button, Tooltip } from '@mui/material'
import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined'
import LightModeOutlined from '@mui/icons-material/LightModeOutlined'
import { useColorMode } from './ColorModeContext'

export default function ThemeToggle() {
  const { mode, toggle } = useColorMode()
  const target = mode === 'light' ? 'dark' : 'light'
  return <Tooltip title={`Switch to ${target} mode`}><Button className="theme-toggle" aria-label={`Switch to ${target} mode`} onClick={toggle} variant="outlined" size="small"
    startIcon={mode === 'light' ? <DarkModeOutlined /> : <LightModeOutlined />} sx={{ minWidth: 88, minHeight: 36, px: 1.5, color: 'text.primary', flexShrink: 0 }}>
    {target === 'dark' ? 'Dark' : 'Light'}
  </Button></Tooltip>
}
