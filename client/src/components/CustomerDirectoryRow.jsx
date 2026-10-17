import { Box, Button, Typography } from '@mui/material'
import { NavArrowRight } from 'iconoir-react'
import EntityAvatar from './EntityAvatar'
import { MinimalStatus } from './StatusChip'

const columns = 'minmax(220px, 1.5fr) minmax(112px, .8fr) 120px var(--admin-action-width, 80px)'

const staffColumns = 'minmax(220px, 1.45fr) minmax(112px, .8fr) minmax(150px, 1fr) 64px minmax(110px, .75fr) 76px'
export function CustomerDirectoryHeader({ staff = false }) {
  return <Box className={`customer-directory-row admin-list-header customer-directory-header${staff ? ' staff-customer-directory-row' : ''}`} style={{ '--customer-row-columns': staff ? staffColumns : columns }} aria-hidden="true">
    {staff ? <><span>Customer</span><span>Customer Type</span><span>Contact</span><span>Vehicles</span><span>Account Status</span><span>Action</span></> : <><span>Customer</span><span>Customer type</span><span>Account status</span><span>Details</span></>}
  </Box>
}

export default function CustomerDirectoryRow({ customer, onDetails, staff = false }) {
  const active = customer.status === 'active' && !customer.isArchived
  return <Box className={`customer-directory-row admin-list-row${staff ? ' staff-customer-directory-row' : ''}`} style={{ '--customer-row-columns': staff ? staffColumns : columns }}>
    <Box className="customer-directory-identity">
      <EntityAvatar name={customer.fullName} type="account" size={40} />
      <Box className="customer-directory-copy">
        <Typography className="customer-directory-name" title={customer.fullName}>{customer.fullName}</Typography>
        {!staff && <Typography title={customer.email || 'No email recorded'}>{customer.email || 'No email recorded'}<span aria-hidden="true"> · </span>{customer.phone || 'No phone recorded'}</Typography>}
      </Box>
    </Box>
    <Typography className="customer-directory-type">{customer.isWalkInCustomer ? 'Walk-In Customer' : 'Online Client'}</Typography>
    {staff && <Box className="customer-directory-contact"><Typography>{customer.email || 'Email unavailable'}</Typography><Typography>{customer.phone || 'Phone unavailable'}</Typography></Box>}
    {staff && <Typography className="customer-directory-vehicles">{customer.vehicleCount ?? customer.vehicles?.length ?? '—'}</Typography>}
    <Box className="customer-directory-state"><MinimalStatus label={customer.isArchived ? 'Archived' : active ? 'Active' : 'Disabled'} status={customer.isArchived ? 'archived' : active ? 'active' : 'inactive'} /></Box>
    <Button className="customer-directory-details admin-list-details" variant="text" endIcon={<NavArrowRight width={16} height={16} strokeWidth={1.7} />} onClick={onDetails}>Details</Button>
  </Box>
}
