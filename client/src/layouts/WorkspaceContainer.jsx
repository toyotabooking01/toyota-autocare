import { Box } from '@mui/material'
import { fullWorkspaceWidth, workspaceCardWidth } from './workspaceDimensions'

export default function WorkspaceContainer({ children }) {
  return <Box component="main" id="workspace-content" className="workspace-content" tabIndex={-1} sx={{
    ...fullWorkspaceWidth, p: { xs: 2, sm: 3, lg: 4 }, outline: 'none',
    '& > .MuiPaper-root, & > .MuiTableContainer-root': workspaceCardWidth,
  }}>{children}</Box>
}
