import { Box, Typography } from '@mui/material'
import { RecordCard } from './RecordList'

function contactPhone(value) {
  const digits = String(value || '').replace(/[\s()-]/g, '').match(/^(?:\+63|0)(9\d{9})$/)?.[1]
  return digits ? `+63 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}` : value || 'No phone recorded'
}

// People need separate contact lines rather than the three-line vehicle summary.
export default function PersonRecordCard({ person, idLabel, idValue, activity, supportingDetail, children, sx }) {
  return <RecordCard className="person-record-card" entityName={person.fullName} entityType="account" avatarSize={42}
    sx={[{
      height: { xs: 'auto', sm: 'auto' },
      '& > .record-entity-avatar': { alignSelf: 'start', mt: .25 },
      '& > .record-card-copy': { maxHeight: 'none' },
      '& .person-record-metadata .MuiTypography-root': { fontSize: 12, lineHeight: 1.5, color: 'text.secondary' },
      '& .person-record-metadata .person-record-activity': { fontSize: 11 },
    }, ...(Array.isArray(sx) ? sx : [sx])]}>
    <Box className="record-card-copy">
      <Typography title={person.fullName}>{person.fullName}</Typography>
      <Box className="person-record-metadata" sx={{ display: 'grid', gap: .5, mt: 1, minWidth: 0 }}>
        {idLabel && <Typography className="person-record-id" title={`${idLabel}: ${idValue || 'Not assigned'}`}>
          <Box component="span" sx={{ fontSize: 11 }}>{idLabel}: </Box><Box component="span" sx={{ color: 'text.primary', fontWeight: 550 }}>{idValue || 'Not assigned'}</Box>
        </Typography>}
        <Typography className="person-record-email" title={person.email || 'No email recorded'}>{person.email || 'No email recorded'}</Typography>
        <Typography className="person-record-phone">{contactPhone(person.phone)}</Typography>
        {activity != null && <Typography className="person-record-activity">{activity}</Typography>}
        {supportingDetail && <Typography className="person-record-activity">{supportingDetail}</Typography>}
      </Box>
    </Box>
    {children}
  </RecordCard>
}
