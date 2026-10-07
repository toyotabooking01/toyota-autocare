import { createTheme } from '@mui/material/styles'
const theme = createTheme({
  palette: { primary: { main: '#eb0a1e', dark: '#c60017' }, text: { primary: '#172032', secondary: '#69758a' }, background: { default: '#f3f6f9', paper: '#ffffff' } },
  typography: { fontFamily: '"Segoe UI", Arial, sans-serif', button: { textTransform: 'none', fontWeight: 650 } },
  shape: { borderRadius: 9 },
  components: {
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { minHeight: 46, paddingInline: 22 }, outlined: { borderColor: '#dbe1e8' } } },
    MuiOutlinedInput: { styleOverrides: { root: { backgroundColor: '#fff', fontSize: 14 }, notchedOutline: { borderColor: '#dbe1e8' }, input: { padding: '13px 14px' } } },
    MuiFormHelperText: { styleOverrides: { root: { marginLeft: 0 } } },
    MuiAlert: { styleOverrides: { root: { fontSize: 13 } } },
  },
})
export default theme
