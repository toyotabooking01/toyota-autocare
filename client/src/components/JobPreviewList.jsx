import { Box, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import StatusChip from './StatusChip'

export default function JobPreviewList({ jobs }) {
  return !jobs.length ? <Typography sx={{ fontSize: 12, color: 'text.secondary', py: 2 }}>No appointments to show.</Typography> : <>
    <Table size="small" aria-label="Service appointments" sx={{ display: { xs: 'none', md: 'table' }, tableLayout: 'fixed', '& th': { bgcolor: '#f7f9fb', color: 'text.secondary', fontSize: 11 }, '& td': { fontSize: 12, py: 2 }, '& td, & th': { px: 1, overflowWrap: 'anywhere', borderColor: '#eef1f5' } }}>
      <TableHead><TableRow>{['Vehicle / client', 'Service', 'Time / bay', 'Status'].map(label => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead>
      <TableBody>{jobs.map(job => <TableRow key={job.id}>
        <TableCell><Typography sx={{ fontSize: 12, fontWeight: 650 }}>{job.vehicle}</Typography><Typography variant="caption" color="text.secondary">{job.customer}</Typography></TableCell>
        <TableCell>{job.service}</TableCell><TableCell>{job.time}<Typography variant="caption" display="block" color="text.secondary">{job.bay}</Typography></TableCell>
        <TableCell><StatusChip status={job.status} /></TableCell>
      </TableRow>)}</TableBody>
    </Table>
    <Stack spacing={2} sx={{ display: { xs: 'flex', md: 'none' } }}>{jobs.map(job => <Box key={job.id} sx={{ pb: 2, borderBottom: '1px solid #eef1f5' }}>
      <Typography sx={{ fontSize: 13, fontWeight: 650 }}>{job.vehicle}</Typography>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', my: .7 }}>{job.service} · {job.time} · {job.bay}</Typography>
      <StatusChip status={job.status} />
    </Box>)}</Stack>
  </>
}
