import { Box, Button, Typography } from '@mui/material'
import { NavArrowRight } from 'iconoir-react'
import EntityAvatar from './EntityAvatar'
import { MoreActionsMenu } from './RowActions'
import { MinimalStatus } from './StatusChip'

const columns = {
  staff: 'minmax(250px, 1fr) 120px 126px var(--admin-action-width, 80px) var(--admin-more-width, 36px)',
  mechanic: 'minmax(250px, 1fr) 120px 132px var(--admin-action-width, 80px) var(--admin-more-width, 36px)',
}

export function AccountDirectoryHeader({ kind }) {
  return <Box className={`account-directory-row admin-list-header account-directory-header account-directory-row--${kind}`} style={{ '--account-row-columns': columns[kind] }} aria-hidden="true">
    <span>{kind === 'staff' ? 'Staff' : 'Mechanic'}</span>
    {kind === 'staff' ? <span>Bookings</span> : <span>Account status</span>}
    {kind === 'staff' ? <span>Account status</span> : <span>Availability</span>}
    <span>Details</span><span>More</span>
  </Box>
}

export default function AccountDirectoryRow({ kind, person, metric, availability, onDetails, menuItems, menuDisabled }) {
  const accountState = person.isArchived ? 'archived' : person.status === 'active' ? 'active' : 'inactive'
  const accountLabel = person.isArchived ? 'Archived' : person.status === 'active' ? 'Active' : 'Disabled'
  return <Box className={`account-directory-row admin-list-row account-directory-row--${kind}`} style={{ '--account-row-columns': columns[kind] }}>
    <Box className="account-directory-identity">
      <EntityAvatar name={person.fullName} type="account" size={40} />
      <Box className="account-directory-copy">
        <Typography className="account-directory-name" title={person.fullName}>{person.fullName}</Typography>
        <Typography className="account-directory-id" title={`${kind === 'staff' ? 'Staff' : 'Mechanic'} ID: ${kind === 'staff' ? person.staffId : person.employeeId}`}>
          {kind === 'staff' ? person.staffId : person.employeeId}
        </Typography>
        <Typography className="account-directory-contact" title={`${person.email || 'No email recorded'} · ${person.phone || 'No phone recorded'}`}>
          {person.email || 'No email recorded'}<span aria-hidden="true"> · </span>{person.phone || 'No phone recorded'}
        </Typography>
      </Box>
    </Box>
    {kind === 'staff' ? <Typography className="account-directory-metric">{metric ?? 0}</Typography>
      : <Box className="account-directory-state"><MinimalStatus label={accountLabel} status={accountState} /></Box>}
    {kind === 'staff' ? <Box className="account-directory-state"><MinimalStatus label={accountLabel} status={accountState} /></Box>
      : <Box className="account-directory-availability"><MinimalStatus label={availability?.label || 'Unknown'} status={availability?.status || 'unknown'} /></Box>}
    <Button className="account-directory-details admin-list-details" variant="text" endIcon={<NavArrowRight width={16} height={16} strokeWidth={1.7} />} onClick={onDetails}>Details</Button>
    <Box className="account-directory-more">{menuItems?.length > 0 && <MoreActionsMenu label={person.fullName} disabled={menuDisabled} items={menuItems} />}</Box>
  </Box>
}
