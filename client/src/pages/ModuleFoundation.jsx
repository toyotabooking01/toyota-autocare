import { Box, Button, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import { PageHeading, Panel } from '../components/DashboardParts'
export default function ModuleFoundation({ role, label, icon: Icon }) {
  return <><PageHeading title={label} subtitle="Your AutoCare workspace." preview={false} />
    <Panel title="Coming in a future phase" sx={{ maxWidth: 720 }}>
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Box sx={{ display: 'inline-flex', color: 'primary.main', bgcolor: 'var(--accent-soft)', p: 2, borderRadius: 3, mb: 2 }}><Icon sx={{ fontSize: 30 }} /></Box>
        <Typography component="h2" sx={{ fontSize: 20, fontWeight: 650 }}>{label} is being prepared</Typography>
        <Typography sx={{ my: 1.5, mx: 'auto', maxWidth: 410, fontSize: 13, color: 'text.secondary' }}>This section is a navigation foundation. No records or actions are available yet.</Typography>
        <Button component={Link} to={`/${role}/dashboard`} variant="outlined" sx={{ mt: 1 }}>Back to dashboard</Button>
      </Box>
    </Panel></>
}
