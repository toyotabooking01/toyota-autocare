import { Box, DialogActions, DialogContent, DialogTitle } from '@mui/material'
import { FormWorkspaceDialog } from './FormWorkspace'
import { ThemeProvider } from '@mui/material/styles'
import createAppTheme from '../theme'

const accountTheme = createAppTheme('dark')

export default function AccountFormDialog({ open, onClose, title, id, onSubmit, children, actions }) {
  return <ThemeProvider theme={accountTheme}><FormWorkspaceDialog open={open} onClose={onClose} slotProps={{ paper: { style: { maxWidth: 720, '--surface': '#20262e', '--line': '#39424d' } } }} aria-labelledby={id} className="account-form-dialog">
    <Box component="form" noValidate onSubmit={onSubmit}>
      <DialogTitle id={id} sx={{ p: 3, pb: 2, fontWeight: 700 }}>{title}</DialogTitle>
      <DialogContent sx={{ p: 3, '&&': { pt: 1 } }}>
        <Box className="account-form-grid" sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2,
          '& > *': { minWidth: 0 }, '& .account-form-wide': { gridColumn: '1 / -1' },
          '& .MuiOutlinedInput-root': { minHeight: 46, backgroundColor: '#272f39' },
          '& .MuiInputBase-readOnly': { backgroundColor: '#20262e', '& input': { fontWeight: 600, letterSpacing: '.04em' } },
        }}>{children}</Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid var(--line)', gap: 1, '& .MuiButton-root': { minHeight: 40 } }}>{actions}</DialogActions>
    </Box>
  </FormWorkspaceDialog></ThemeProvider>
}
