import { Box, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import StatusChip, { MinimalStatus } from './StatusChip'
import { RecordCard, RecordActions } from './RecordList'
import { useState } from 'react'
import { DetailsButton, QuietDetailsButton } from './RowActions'
import { DetailDialog, DetailInfo, DetailSection } from './RecordDetails'
import { statusStyles } from '../app/statuses'

export default function JobPreviewList({ jobs, variant = 'cards', detailPath }) {
  const [selected, setSelected] = useState(null)
  return !jobs.length ? <Typography sx={{ fontSize: 12, color: 'text.secondary', py: 2 }}>{variant === 'rows' ? 'No open job orders.' : 'No appointments to show.'}</Typography>
    : variant === 'rows' ? <Box className="staff-open-job-order-list" role="list" aria-label="Open job orders">
      {jobs.map(job => <Box component="article" role="listitem" className="staff-open-job-order-row admin-list-row" key={job.id}>
        <Box className="staff-open-job-order-copy"><Typography>{job.vehicle}</Typography><Typography>{job.service}</Typography><Typography>{job.time} · {job.bay}</Typography></Box>
        <MinimalStatus label={statusStyles[job.status]?.label || 'Status unavailable'} status={job.status} />
        <QuietDetailsButton className="admin-list-details" component={Link} to={`${detailPath}?open=${encodeURIComponent(job.id)}`} aria-label={`Details for ${job.vehicle}`} />
      </Box>)}
    </Box> : <><Box className="record-preview-list" aria-label="Service appointments" sx={{ display: 'grid', gap: 1.25, minWidth: 0, containerType: 'inline-size' }}>
      {jobs.map(job => <RecordCard key={job.id}>
        <Box className="record-card-copy"><Typography>{job.vehicle}</Typography>
          <Typography>{job.time} · {job.bay}</Typography>
          <Typography>{job.service}{job.customer ? ` · ${job.customer}` : ''}</Typography>
        </Box><RecordActions statuses={<StatusChip status={job.status} />}><DetailsButton onClick={() => setSelected(job)} /></RecordActions>
      </RecordCard>)}
    </Box><DetailDialog open={Boolean(selected)} onClose={() => setSelected(null)} title="Service visit details" reference={selected && `Reference ${selected.id}`} status={selected && <StatusChip status={selected.status} />}>
      {selected && <DetailSection title="Service overview"><DetailInfo items={[
        ['Vehicle', selected.vehicle], ['Customer', selected.customer], ['Service', selected.service], ['Schedule', selected.time], ['Service Bay', selected.bay],
      ]} /></DetailSection>}
    </DetailDialog></>
}
