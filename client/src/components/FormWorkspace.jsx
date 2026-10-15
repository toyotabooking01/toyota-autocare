import { Dialog, Paper } from '@mui/material'
import { workspaceCardWidth, workspaceSidebarWidth, workspaceTopbarHeight } from '../layouts/workspaceDimensions'

const panel = {
  ...workspaceCardWidth,
  p: { xs: 2, sm: 3, lg: 4 }, borderColor: 'var(--line)', borderRadius: '16px',
  bgcolor: 'var(--surface)',
}

export default function FormWorkspace({ children, sx, ...props }) {
  return <Paper variant="outlined" className="form-workspace" {...props} sx={[panel, ...(Array.isArray(sx) ? sx : [sx])]}>{children}</Paper>
}

export function FormWorkspaceDialog({ children, ...props }) {
  return <Dialog {...props} fullWidth maxWidth={false} sx={{
    left: { xs: 0, lg: workspaceSidebarWidth },
    // Include the shell's one-pixel topbar border in the content offset.
    top: { xs: workspaceTopbarHeight.xs + 1, sm: workspaceTopbarHeight.sm + 1 },
    '& .MuiDialog-container': {
      alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', p: { xs: 2, sm: 3, lg: 4 },
      '@media (max-height: 700px)': { alignItems: 'flex-start', pt: 3, pb: 3 },
    },
    '& .MuiBackdrop-root': { position: 'fixed', inset: 0, bgcolor: 'rgba(0, 0, 0, 0.6)' },
    '& .MuiDialog-paper': {
      width: '100%', maxWidth: 1320, height: 'auto', minHeight: 0,
      maxHeight: 'min(85vh, 100%)', minWidth: 0, overflowY: 'auto',
      m: 0, borderRadius: '16px', bgcolor: 'var(--surface)', border: '1px solid var(--line)',
      '& > form': { display: 'flex', flexDirection: 'column', flex: '0 1 auto', height: 'auto', minHeight: 0 },
    },
    '& .MuiDialogTitle-root': { px: { xs: 2, sm: 3 }, pt: { xs: 2, sm: 3 }, pb: 2 },
    '& .MuiDialogContent-root': { flex: '0 1 auto', px: { xs: 2, sm: 3 }, pb: 2.5 },
    '& .MuiDialogActions-root': { px: { xs: 2, sm: 3 }, py: 2, borderTop: '1px solid var(--line)', gap: 1, flexShrink: 0 },
  }}>{children}</Dialog>
}
