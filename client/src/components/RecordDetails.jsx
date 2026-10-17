import { useContext, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, Typography } from '@mui/material'
import { Xmark } from 'iconoir-react'
import { MinimalStatus, StatusBadge } from './StatusChip'
import { DetailActionContext } from './DetailActionContext'
import ToyotaVehicleImage from './ToyotaVehicleImage'
import { catalogVehicleImages } from '../utils/toyotaCatalog'
import { money } from '../pages/bookingDisplay'

const fullWidth = { width: '100%', minWidth: 0, boxSizing: 'border-box' }
const actionStyle = { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', gap: 1,
  '& .MuiButton-root': { minHeight: 40, maxWidth: '100%' }, '& .MuiButton-contained': { order: 1 } }

export function DetailHeader({ title, reference, status, id, onClose }) {
  return <Stack className="detail-header" direction={{ xs: 'column', sm: 'row' }} spacing={1.5}
    sx={{ ...fullWidth, justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'flex-start' } }}>
    <Box sx={{ minWidth: 0 }}><Typography component="h2" id={id} sx={{ fontSize: 21, fontWeight: 700 }}>{title}</Typography>
      {reference && <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: .5, overflowWrap: 'anywhere' }}>{reference}</Typography>}</Box>
    {(status || onClose) && <Stack direction="row" spacing={1.25} alignItems="center" sx={{ flexShrink: 0, maxWidth: '100%' }}>
      {status && <Box sx={{ maxWidth: '100%' }}>{status}</Box>}
      {onClose && <IconButton aria-label="Close details" onClick={onClose} size="small"><Xmark width={19} height={19} strokeWidth={1.7} /></IconButton>}
    </Stack>}
  </Stack>
}

export function DetailDialog({ open, onClose, title, reference, status, children, actions, id: suppliedId, className, navigation, paperSx }) {
  const generatedId = useId()
  const id = suppliedId || generatedId
  const [footer, setFooter] = useState(null)
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth={false} aria-labelledby={id}
    className={`record-detail-dialog${className ? ` ${className}` : ''}`} slotProps={{ paper: { sx: { width: 'calc(100% - 32px)', maxWidth: 800, m: 2, minWidth: 0, borderRadius: '14px', ...paperSx } } }}>
    <DialogTitle component="div" sx={{ p: { xs: 2, sm: 3 }, borderBottom: '1px solid var(--line)' }}>
    <DetailHeader id={id} title={title} reference={reference} status={status} onClose={className?.includes('booking-record-detail-dialog') || className?.includes('account-management-dialog') || className?.includes('job-order-details-dialog') || className?.includes('service-record-dialog') || className?.includes('admin-archive-details-dialog') ? onClose : undefined} />
    </DialogTitle>
    {navigation && <Box className="detail-navigation" sx={{ flex: '0 0 auto', borderBottom: '1px solid var(--line)' }}>{navigation}</Box>}
    <DetailActionContext.Provider value={footer}>
      <DialogContent sx={{ p: { xs: 2, sm: 3 }, '&&': { pt: { xs: 2, sm: 3 } }, minWidth: 0 }}>
        <Box className="record-details" sx={{ ...fullWidth, display: 'grid', gap: 2, pt: .5 }}>{children}</Box>
      </DialogContent>
      <DialogActions className="detail-footer" sx={{ ...actionStyle, p: { xs: 2, sm: 2.5 }, borderTop: '1px solid var(--line)' }}>
        <Button onClick={onClose}>Close</Button>{actions}<Box ref={setFooter} sx={{ display: 'contents' }} />
      </DialogActions>
    </DetailActionContext.Provider>
  </Dialog>
}

export function DetailFooter({ children }) {
  const target = useContext(DetailActionContext)
  if (target !== undefined) return target ? createPortal(children, target) : null
  return <Box className="detail-footer" sx={{ ...actionStyle, borderTop: '1px solid var(--line)', pt: 2, mt: .5 }}>{children}</Box>
}

export function DetailGrid({ children }) {
  return <Box className="detail-grid" sx={{ ...fullWidth, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2, '& > :only-child': { gridColumn: '1 / -1' } }}>{children}</Box>
}

export function DetailSection({ title, children, summary = false, section, action, actionHeaderSx, actionHeaderClassName, actionTitleClassName }) {
  const id = useId()
  return <Box component="section" aria-labelledby={id} data-section={section} className="detail-section" sx={{ ...fullWidth, border: '1px solid var(--line)',
    borderRadius: '10px', p: 2, bgcolor: summary ? 'var(--surface-soft)' : 'transparent' }}>
    {action ? <Stack className={`detail-section-header${actionHeaderClassName ? ` ${actionHeaderClassName}` : ''}`} direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2} sx={{ width: '100%', mb: 1.5, ...actionHeaderSx }}>
      <Typography className={actionTitleClassName} component="h3" id={id} sx={{ minWidth: 0, fontSize: 14, fontWeight: 650 }}>{title}</Typography>{action}
    </Stack> : <Typography component="h3" id={id} sx={{ fontSize: 14, fontWeight: 700, mb: 1.5 }}>{title}</Typography>}
    {children}
  </Box>
}

export function DetailInfo({ items }) {
  return <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.75, '& > :only-child': { gridColumn: '1 / -1' } }}>
    {items.map(([label, value]) => <Box key={label} sx={{ minWidth: 0 }}>
      <Typography component="dt" sx={{ fontSize: 11, color: 'text.secondary', mb: .4 }}>{label}</Typography>
      <Typography component="dd" sx={{ m: 0, fontSize: 13, fontWeight: value != null && value !== '' ? 550 : 400, color: value != null && value !== '' ? 'text.primary' : 'text.secondary', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{value != null && value !== '' ? value : 'Record unavailable'}</Typography>
    </Box>)}
  </Box>
}

export function AccountStatus({ account, minimal = false }) {
  const status = account?.isArchived ? 'archived' : account?.status === 'active' ? 'active' : account?.status ? 'inactive' : 'unknown'
  const label = minimal ? account?.isArchived ? 'Archived' : account?.status === 'active' ? 'Active' : account?.status ? 'Disabled' : 'Record unavailable'
    : account?.isArchived ? 'Archived' : account?.status || 'Record unavailable'
  return minimal ? <MinimalStatus label={label} status={status} />
    : <StatusBadge label={label} sx={{ bgcolor: account?.isArchived ? 'var(--surface-soft)' : account?.status === 'active' ? 'var(--green-soft)' : 'var(--amber-soft)' }} />
}

export function AccountRecordDetails({ account, kind }) {
  const accountStatus = account?.isArchived ? 'archived' : account?.status === 'active' ? 'active' : account?.status ? 'inactive' : 'unknown'
  const availabilityStatus = account?.availability === 'available' ? 'available' : account?.availability === 'busy' ? 'busy' : account?.availability === 'off_duty' ? 'unavailable' : 'unknown'
  return <>
    <DetailSection title="Account information"><DetailInfo items={[
      ['Full name', account?.fullName], ['Email', account?.email], ['Phone', account?.phone],
      ...(kind === 'staff' ? [['Staff ID', account?.staffId]] : kind === 'mechanic' ? [['Mechanic ID', account?.employeeId]] : [['Address', account?.address], ['Customer type', account?.isWalkInCustomer ? 'Walk-In Customer' : 'Online Client']]),
    ]} /></DetailSection>
    {kind === 'staff' && <DetailSection title="Monitoring summary" summary><DetailInfo items={[["Bookings last processed", account?.processedBookings ?? 0]]} /></DetailSection>}
    {kind === 'mechanic' && <>
      <DetailSection title="Status and availability"><DetailInfo items={[
        ['Account status', <MinimalStatus label={account?.isArchived ? 'Archived' : account?.status === 'active' ? 'Active' : 'Disabled'} status={accountStatus} />],
        ['Availability', <MinimalStatus label={account?.availability === 'off_duty' ? 'Unavailable' : account?.availability ? account.availability.replaceAll('_', ' ').replace(/^\w/, letter => letter.toUpperCase()) : 'Record unavailable'} status={availabilityStatus} />],
      ]} /></DetailSection>
      <DetailSection title="Specialization"><DetailInfo items={[["Specialization", account?.specialization?.length ? account.specialization.join(', ') : null]]} /></DetailSection>
    </>}
  </>
}

export function DetailVehicle({ vehicle, showCatalogImage = true }) {
  if (!vehicle) return <DetailInfo items={[["Vehicle", null]]} />
  const sources = [...(showCatalogImage ? catalogVehicleImages([], vehicle) : []), vehicle.imageUrl].filter(Boolean)
  return <Stack direction="row" spacing={1.5} sx={{ minWidth: 0, alignItems: 'center' }}>
    {sources.length > 0 && <Box sx={{ width: 96, height: 64, flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: 'var(--surface-soft)', borderRadius: 1.5 }}>
      <ToyotaVehicleImage vehicle={vehicle} sources={sources} allowExternal={false} alt={`${vehicle.make} ${vehicle.model}`}
        style={{ width: '100%', height: '100%', maxHeight: 64, objectFit: 'contain' }} />
    </Box>}
    <Box sx={{ minWidth: 0 }}><Typography sx={{ fontSize: 14, fontWeight: 650 }}>{vehicle.make} {vehicle.model}</Typography>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: .5 }}>{[vehicle.year, vehicle.transmission?.replaceAll('_', ' ')].filter(Boolean).join(' · ')}</Typography>
      {vehicle.variant && <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: .5 }}>{vehicle.variant}</Typography>}
      <Typography sx={{ fontSize: 13, fontWeight: 550, mt: .5 }}>{vehicle.plateNumber || 'Plate not recorded'}{vehicle.isArchived ? ' · Archived' : ''}</Typography>
    </Box>
  </Stack>
}

export function ServiceEstimate({ services = [], total, note = 'Prices may have changed since this booking was made.' }) {
  return <DetailSection title="Service estimate" summary>
    <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 1 }}>
      {services.length ? services.map((service, index) => <Box component="li" key={service?._id || index} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 1.5, alignItems: 'start' }}>
        <Typography sx={{ fontSize: 13 }}>{service?.name || 'Service record unavailable'}{service?.isArchived ? ' · Archived' : ''}</Typography>
        <Typography sx={{ fontSize: 13, whiteSpace: 'nowrap' }}>{service ? money(service.estimatedPrice) : '—'}</Typography>
      </Box>) : <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>No services recorded.</Typography>}
    </Box>
    <Stack className="detail-total" direction="row" sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid var(--line)', justifyContent: 'space-between', gap: 2 }}>
      <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Total</Typography>
      <Typography sx={{ fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap' }}>{money(total ?? services.reduce((sum, service) => sum + Number(service?.estimatedPrice || 0), 0))}</Typography>
    </Stack>
    {note && <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 1 }}>{note}</Typography>}
  </DetailSection>
}
