import { Box, DialogActions, DialogContent, DialogTitle, IconButton } from '@mui/material'
import { Xmark } from 'iconoir-react'
import { FormWorkspaceDialog } from './FormWorkspace'

export default function AccountFormDialog({ open, onClose, title, id, onSubmit, children, actions }) {
  return <FormWorkspaceDialog open={open} onClose={onClose} aria-labelledby={id} className="account-form-dialog">
    <Box component="form" noValidate onSubmit={onSubmit}>
      <DialogTitle id={id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, fontSize: 21, fontWeight: 600 }}>
        <span>{title}</span><IconButton aria-label={`Close ${title}`} onClick={onClose} size="small"><Xmark width={18} height={18} strokeWidth={1.7} /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 3, '&&': { pt: 1 } }}>
        <Box className="account-form-grid" sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2,
          '& > *': { minWidth: 0 }, '& .account-form-wide': { gridColumn: '1 / -1' },
          '& .MuiOutlinedInput-root': { minHeight: 46, backgroundColor: 'var(--surface)' },
          '& .account-id-field .MuiOutlinedInput-root': { backgroundColor: 'var(--surface-soft)' },
          '& .account-id-field input': { fontWeight: 600, letterSpacing: '.035em', color: 'text.secondary' },
        }}>{children}</Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid var(--line)', gap: 1, '& .MuiButton-root': { minHeight: 40 } }}>{actions}</DialogActions>
    </Box>
  </FormWorkspaceDialog>
}
