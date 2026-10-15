import { useEffect, useMemo, useState } from 'react'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import createAppTheme from '../theme'
import { ColorModeContext } from './ColorModeContext'

const storageKey = 'toyota-autocare.color-mode'
function initialMode() {
  try { const saved = localStorage.getItem(storageKey); if (saved === 'light' || saved === 'dark' || saved === 'system') return saved } catch { /* Storage can be disabled. */ }
  return 'system'
}
export default function AppThemeProvider({ children }) {
  const [preference, setPreference] = useState(initialMode)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches || false)
  const mode = preference === 'system' ? systemDark ? 'dark' : 'light' : preference
  const theme = useMemo(() => createAppTheme(mode), [mode])
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    const update = event => setSystemDark(event.matches)
    media?.addEventListener('change', update)
    return () => media?.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    document.documentElement.dataset.colorMode = mode
    document.documentElement.style.colorScheme = mode
  }, [mode])
  useEffect(() => { try { localStorage.setItem(storageKey, preference) } catch { /* Keep the in-memory preference. */ } }, [preference])
  const context = useMemo(() => ({ mode, preference, setPreference, toggle: () => setPreference(mode === 'light' ? 'dark' : 'light') }), [mode, preference])
  return <ColorModeContext.Provider value={context}><ThemeProvider theme={theme}><CssBaseline />{children}</ThemeProvider></ColorModeContext.Provider>
}
