import { createTheme } from '@mui/material/styles'
export default function createAppTheme(mode) {
const dark = mode === 'dark'
return createTheme({
  palette: { mode, primary: { main: dark ? '#ff3545' : '#e50920', dark: '#bd0619' }, text: { primary: dark ? '#f1f5fa' : '#142238', secondary: dark ? '#a6b3c5' : '#63728a' }, background: { default: dark ? '#080d14' : '#f2f5fa', paper: dark ? '#101923' : '#ffffff' }, divider: dark ? '#253140' : '#e3e9f1' },
  typography: { fontFamily: '"Segoe UI", Arial, sans-serif', button: { textTransform: 'none', fontWeight: 650 } },
  shape: { borderRadius: 12 },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { minHeight: 44, paddingInline: 20 }, containedPrimary: { color: '#fff', background: 'linear-gradient(120deg, #ff2334, #d00017)', boxShadow: '0 6px 24px #ed092020', '&.Mui-disabled': { background: dark ? '#26313d' : '#e3e7ed', color: dark ? '#a6b3c5' : '#63728a', boxShadow: 'none' } }, outlined: { borderColor: dark ? '#3b3542' : '#dce3ed' } } },
    MuiDialogTitle: { styleOverrides: { root: { overflowWrap: 'anywhere' } } },
    MuiDialogActions: { styleOverrides: { root: { flexWrap: 'wrap', rowGap: 8 } } },
    MuiTypography: { styleOverrides: { root: { overflowWrap: 'anywhere' } } },
    MuiOutlinedInput: { styleOverrides: { root: { backgroundColor: dark ? '#121c28' : '#f7f9fc', fontSize: 14 }, notchedOutline: { borderColor: dark ? '#2c3949' : '#dce3ed' }, input: { padding: '13px 14px' } } },
    MuiFormHelperText: { styleOverrides: { root: { marginLeft: 0, overflowWrap: 'anywhere' } } },
    MuiAlert: { styleOverrides: { root: { fontSize: 13, minWidth: 0 }, message: { minWidth: 0, overflowWrap: 'anywhere' } } },
  },
})
}
