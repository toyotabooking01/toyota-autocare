import { Box, Typography } from '@mui/material'
import StatusChip from './StatusChip'
import { RecordCard, RecordActions } from './RecordList'
import { useState } from 'react'
import { DetailsButton } from './RowActions'
import { DetailDialog, DetailInfo, DetailSection } from './RecordDetails'

export default function JobPreviewList({ jobs }) {
  const [selected, setSelected] = useState(null)
  return !jobs.length ? <Typography sx={{ fontSize: 12, color: 'text.secondary', py: 2 }}>No appointments to show.</Typography>
    : <><Box className="record-preview-list" aria-label="Service appointments" sx={{ display: 'grid', gap: 1.25, minWidth: 0, containerType: 'inline-size' }}>
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
