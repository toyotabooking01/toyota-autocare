import { Box, Button, Typography } from '@mui/material'
import { NavArrowRight, Tools } from 'iconoir-react'
import { MinimalStatus } from './StatusChip'
import { MoreActionsMenu } from './RowActions'

const columns = 'minmax(0, 1fr) 88px 100px 104px 96px var(--admin-action-width, 80px) var(--admin-more-width, 36px)'

export function ServiceDirectoryHeader() {
  return <Box className="service-directory-row admin-list-header service-directory-header" style={{ '--service-row-columns': columns }} aria-hidden="true">
    <span>Service</span><span>Duration</span><span>Price</span><span>Type</span><span>Status</span><span>Details</span><span>More</span>
  </Box>
}

export default function ServiceDirectoryRow({ service, onDetails, onEdit, onArchive, disabled }) {
  const status = service.isArchived ? 'archived' : service.isActive ? 'active' : 'inactive'
  const label = service.isArchived ? 'Archived' : service.isActive ? 'Active' : 'Inactive'
  const actions = [!service.isArchived && { label: 'Edit', onClick: onEdit },
    !(service.isOtherService && !service.isArchived) && { label: service.isArchived ? 'Restore' : 'Archive', onClick: onArchive }].filter(Boolean)
  return <Box className="service-directory-row admin-list-row">
    <Box className="service-directory-identity">
      <span className="service-directory-icon" aria-hidden="true"><Tools width={18} height={18} strokeWidth={1.7} /></span>
      <Box sx={{ minWidth: 0 }}><Typography className="service-directory-name" title={service.name}>{service.name}</Typography>
        {service.description && <Typography className="service-directory-description" title={service.description}>{service.description}</Typography>}
      </Box>
    </Box>
    <Typography className="service-directory-duration">{service.estimatedDuration} min</Typography>
    <Typography className="service-directory-price">₱{Number(service.estimatedPrice).toLocaleString('en-PH')}</Typography>
    <Typography className="service-directory-type" title={service.type}>{service.type}</Typography>
    <MinimalStatus label={label} status={status} />
    <Button className="service-directory-details admin-list-details" variant="text" endIcon={<NavArrowRight width={16} height={16} strokeWidth={1.7} />} onClick={onDetails}>Details</Button>
    <Box className="service-directory-more">{actions.length > 0 && <MoreActionsMenu label={service.name} disabled={disabled} items={actions} />}</Box>
  </Box>
}
