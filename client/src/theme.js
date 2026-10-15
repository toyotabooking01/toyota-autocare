import { createTheme } from '@mui/material/styles'

export default function createAppTheme(mode) {
  const dark = mode === 'dark'
  const ink = dark ? '#f8fafc' : '#111827'
  const muted = dark ? '#9eadba' : '#64748b'
  const line = dark ? '#31404d' : '#dde3e8'
  const action = dark ? '#d1d5db' : '#2f343b'
  const actionHover = dark ? '#f8fafc' : '#4b5563'
  const actionInk = dark ? '#111827' : '#ffffff'

  return createTheme({
    palette: {
      mode,
      primary: { main: action, dark: actionHover, contrastText: actionInk },
      secondary: { main: dark ? '#9ca3af' : '#4b5563' },
      text: { primary: ink, secondary: muted },
      background: { default: dark ? '#0b1117' : '#f3f5f7', paper: dark ? '#161f28' : '#ffffff' },
      divider: line,
      info: { main: dark ? '#aebdcb' : '#526579' },
      success: { main: dark ? '#9cc7b0' : '#347054' },
      warning: { main: dark ? '#d4b88c' : '#8b6633' },
      error: { main: dark ? '#ef9a9a' : '#b34242' },
    },
    typography: {
      fontFamily: 'Inter, "Segoe UI", Arial, sans-serif',
      h1: { fontWeight: 700 }, h2: { fontWeight: 700 }, h3: { fontWeight: 650 },
      button: { textTransform: 'none', fontWeight: 650 },
    },
    shape: { borderRadius: 12 },
    components: {
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' }, outlined: { borderColor: line } } },
      MuiCard: { styleOverrides: { root: { border: `1px solid ${line}`, boxShadow: 'none' } } },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { minHeight: 44, paddingInline: 18, borderRadius: 10 },
          containedPrimary: {
            color: actionInk, background: action, boxShadow: 'none',
            '&:hover': { background: actionHover, boxShadow: 'none' },
            '&.Mui-disabled': { background: dark ? '#374151' : '#e5e7eb', color: muted },
          },
          outlinedPrimary: {
            color: ink, borderColor: dark ? '#6b7280' : '#9ca3af',
            '&:hover': { borderColor: dark ? '#d1d5db' : '#4b5563', background: dark ? '#2f343b' : '#eef1f4' },
          },
          textPrimary: { color: ink, '&:hover': { background: dark ? '#2f343b' : '#e5e7eb' } },
        },
      },
      MuiIconButton: { styleOverrides: { root: { color: muted, '&:hover': { background: dark ? '#2f343b' : '#e5e7eb' } } } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            color: ink, backgroundColor: dark ? '#1d2833' : '#f8fafc', fontSize: 14, borderRadius: 10,
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: dark ? '#6b7280' : '#9ca3af' },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#9ca3af', borderWidth: 2 },
          },
          notchedOutline: { borderColor: dark ? '#31404d' : '#d1d5db' },
          input: { padding: '13px 14px', caretColor: dark ? '#d1d5db' : '#4b5563' },
        },
      },
      MuiInputLabel: { styleOverrides: { root: { color: muted, '&.Mui-focused': { color: dark ? '#d1d5db' : '#4b5563' } } } },
      MuiFormLabel: { styleOverrides: { root: { '&.Mui-focused': { color: dark ? '#d1d5db' : '#4b5563' } } } },
      MuiCheckbox: { styleOverrides: { root: { color: muted, '&.Mui-checked': { color: dark ? '#d1d5db' : '#4b5563' } } } },
      MuiRadio: { styleOverrides: { root: { color: muted, '&.Mui-checked': { color: dark ? '#d1d5db' : '#4b5563' } } } },
      MuiSwitch: { styleOverrides: { switchBase: { '&.Mui-checked': { color: action, '& + .MuiSwitch-track': { backgroundColor: dark ? '#6b7280' : '#4b5563' } } } } },
      MuiChip: { styleOverrides: { root: { borderRadius: 8, fontWeight: 600 } } },
      MuiPaginationItem: { styleOverrides: { root: { '&.Mui-selected': { background: dark ? '#2f343b' : '#e5e7eb', color: ink, '&:hover': { background: dark ? '#4b5563' : '#d1d5db' } } } } },
      MuiStepIcon: { styleOverrides: { root: { '&.Mui-active, &.Mui-completed': { color: dark ? '#d1d5db' : '#4b5563' } } } },
      MuiDialog: { styleOverrides: { paper: { border: `1px solid ${line}`, borderRadius: 16, boxShadow: dark ? '0 22px 60px #0008' : '0 22px 60px #11182722' } } },
      MuiDialogTitle: { styleOverrides: { root: { overflowWrap: 'anywhere', fontWeight: 700 } } },
      MuiDialogActions: { styleOverrides: { root: { flexWrap: 'wrap', rowGap: 8 } } },
      MuiTypography: { styleOverrides: { root: { overflowWrap: 'anywhere' } } },
      MuiFormHelperText: { styleOverrides: { root: { marginLeft: 0, overflowWrap: 'anywhere' } } },
      MuiAlert: { styleOverrides: { root: { fontSize: 13, minWidth: 0, borderRadius: 10 }, message: { minWidth: 0, overflowWrap: 'anywhere' } } },
      MuiCircularProgress: { defaultProps: { color: 'primary' } },
    },
  })
}
