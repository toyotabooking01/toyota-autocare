import { useEffect, useMemo, useState } from 'react'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import createAppTheme from '../theme'
import { ColorModeContext } from './ColorModeContext'

const storageKey = 'toyota-autocare.color-mode'
function initialMode() {
  try { const saved = localStorage.getItem(storageKey); if (saved === 'light' || saved === 'dark') return saved } catch { /* Storage can be disabled. */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
export default function AppThemeProvider({ children }) {
  const [mode, setMode] = useState(initialMode)
  const theme = useMemo(() => createAppTheme(mode), [mode])
  useEffect(() => {
    document.documentElement.dataset.colorMode = mode
    document.documentElement.style.colorScheme = mode
    try { localStorage.setItem(storageKey, mode) } catch { /* Keep the in-memory preference. */ }
  }, [mode])
  const context = useMemo(() => ({ mode, toggle: () => setMode(current => current === 'light' ? 'dark' : 'light') }), [mode])
  return <ColorModeContext.Provider value={context}><ThemeProvider theme={theme}><CssBaseline />{children}</ThemeProvider></ColorModeContext.Provider>
}
