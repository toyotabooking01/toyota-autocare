import { DetailGrid, DetailInfo, DetailSection, DetailVehicle, ServiceEstimate } from './RecordDetails'
import { dateLabel } from '../pages/bookingDisplay'
import PaymentPanel from './PaymentPanel'
import AdditionalWorkPanel from './AdditionalWorkPanel'
import { Box, Typography } from '@mui/material'
import { MinimalStatus } from './StatusChip'

export default function BookingRecordDetails({ booking, business = false, total, role, onPaymentDecision, view = 'all', adminDetail = false }) {
  const showOverview = view === 'all' || view === 'overview'
  const showBilling = view === 'all' || view === 'billing'
  const showActivity = view === 'all' || view === 'activity'
  const bookedServices = booking.estimatedServiceItems?.length
    ? booking.estimatedServiceItems.map(item => ({ _id: item.serviceId, name: item.name, estimatedPrice: item.priceCents / 100 }))
    : booking.services
  return <>
    {showOverview && <>
    <DetailSection title="Booking overview">
      <DetailInfo items={[
        ['Booking source', booking.bookingType === 'walk-in' ? 'Walk-In' : 'Online'],
        ['Schedule', `${dateLabel(booking.bookingDate)} · ${booking.bookingTime || 'Time not recorded'}`],
        ['Current status', booking.status ? <MinimalStatus label={booking.status.replaceAll('_', ' ').replace(/^\w/, letter => letter.toUpperCase())} status={booking.status} /> : 'Record unavailable'],
        ...(!adminDetail && booking.holdReleaseReason === 'expired' ? [['Downpayment', 'Downpayment window expired']] : []),
        ...(business && !adminDetail && booking.createdByStaff ? [[`Created by ${booking.createdByRole === 'admin' ? 'Admin' : 'Staff'}`, [booking.createdByStaff.fullName, booking.createdByRole === 'admin' ? '' : booking.createdByStaff.staffId].filter(Boolean).join(' · ')]] : []),
        ...(business && !adminDetail && booking.lastProcessedBy ? [['Last action by', `${booking.lastProcessedBy.fullName} (${booking.lastProcessedByRole || booking.lastProcessedBy.role || 'operator'})`]] : []),
        ...(business && booking.assignedMechanic ? [['Assigned Mechanic', booking.assignedMechanic.fullName]] : []),
        ...(booking.status === 'completed' ? [['Release Status', <MinimalStatus label="Vehicle Released" status="released" />],
          ...(!adminDetail && booking.releasedAt ? [['Released At', new Date(booking.releasedAt).toLocaleString()]] : []),
          ...(!adminDetail && booking.releasedByRole ? [['Released By', `${booking.lastProcessedBy?.fullName || 'Service center'} (${booking.releasedByRole === 'admin' ? 'Admin' : 'Staff'})`]] : [])] : []),
      ]} />
    </DetailSection>
    <DetailGrid>
      {business && <DetailSection title="Customer"><DetailInfo items={[["Client", booking.client?.fullName],
        ...(booking.client?.email !== undefined ? [['Email', booking.client.email || 'No email']] : []),
        ...(booking.client?.phone !== undefined ? [['Phone', booking.client.phone]] : []),
      ]} /></DetailSection>}
      <DetailSection title="Vehicle"><DetailVehicle vehicle={booking.vehicle} /></DetailSection>
    </DetailGrid>
    <ServiceEstimate services={bookedServices} total={total ?? (booking.estimatedTotalCents != null ? booking.estimatedTotalCents / 100 : undefined)}
      note={booking.estimatedServiceItems?.length ? 'Booked service prices are saved. The final bill and any approved additional work appear below.'
        : booking.estimatedTotalCents != null ? 'The booked estimate is saved, but this older booking has no item-price snapshot. See the final invoice for its authoritative total.' : undefined} />
    {booking.concern && <DetailSection title="Customer concern"><DetailInfo items={[["Concern", booking.concern]]} /></DetailSection>}
    </>}
    {showBilling && booking._id && <PaymentPanel bookingId={booking._id} bookingStatus={booking.status}
      role={role || (business ? 'staff' : 'client')} onDecision={onPaymentDecision} />}
    {showActivity && adminDetail && booking._id && <>
      {['in_service', 'final_inspection', 'ready_for_release', 'completed'].includes(booking.status)
        ? <AdditionalWorkPanel bookingId={booking._id} bookingStatus={booking.status} mechanicName={booking.assignedMechanic?.fullName} role={role || 'admin'} compact />
        : <Box sx={{ py: 1, borderBottom: '1px solid var(--line)' }}><Typography component="h3" sx={{ fontSize: 13, fontWeight: 650, mb: .5 }}>Additional work</Typography><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>No additional work requested.</Typography></Box>}
      {(booking.createdByStaff || booking.lastProcessedBy || (booking.releasedAt && booking.releasedByRole)) && <DetailSection title="Processing details">
        <DetailInfo items={[
          ...(booking.createdByStaff ? [[`Created by ${booking.createdByRole === 'admin' ? 'Admin' : 'Staff'}`, [booking.createdByStaff.fullName, booking.createdByRole === 'admin' ? '' : booking.createdByStaff.staffId].filter(Boolean).join(' · ')]] : []),
          ...(booking.lastProcessedBy ? [['Last action by', `${booking.lastProcessedBy.fullName} (${booking.lastProcessedByRole || booking.lastProcessedBy.role || 'operator'})`]] : []),
          ...(booking.releasedAt ? [['Released at', new Date(booking.releasedAt).toLocaleString()]] : []),
          ...(booking.releasedByRole ? [['Released by', `${booking.lastProcessedBy?.fullName || 'Service center'} (${booking.releasedByRole === 'admin' ? 'Admin' : 'Staff'})`]] : []),
        ]} />
      </DetailSection>}
      <DetailSection title="Booking activity">
        {business && booking.activity?.length > 0 ? <BookingActivity events={booking.activity.slice(-8).reverse()} />
          : <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>No activity recorded.</Typography>}
      </DetailSection>
    </>}
    {showActivity && !adminDetail && booking._id && ['in_service', 'final_inspection', 'ready_for_release', 'completed'].includes(booking.status)
      && <AdditionalWorkPanel bookingId={booking._id} bookingStatus={booking.status} mechanicName={booking.assignedMechanic?.fullName} role={role || (business ? 'staff' : 'client')} />}
    {showActivity && !adminDetail && business && booking.activity?.length > 0 && <DetailSection title="Activity"><DetailInfo items={booking.activity.slice(-8).reverse().map(entry => [entry.action.replaceAll('_', ' ').replaceAll('-', ' '), `${entry.performedBy?.fullName || 'User'} (${entry.performedByRole}) · ${new Date(entry.performedAt).toLocaleString()}`])} /></DetailSection>}
  </>
}

function BookingActivity({ events }) {
  return <Box component="ol" aria-label="Booking activity" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 0 }}>
    {events.map((event, index) => <Box component="li" key={`${event.action}-${event.performedAt}-${index}`} sx={{ display: 'grid', gridTemplateColumns: '14px minmax(0, 1fr)', gap: 1.25, minWidth: 0 }}>
      <Box sx={{ position: 'relative', display: 'flex', justifyContent: 'center', pt: '5px', '&::after': index < events.length - 1 ? { position: 'absolute', top: 12, bottom: 0, width: '1px', bgcolor: 'var(--line)', content: '""' } : {} }}>
        <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'var(--muted)', zIndex: 1 }} />
      </Box>
      <Box sx={{ minWidth: 0, pb: 1.5 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{event.action.replaceAll('_', ' ').replaceAll('-', ' ')}</Typography>
        <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{event.performedBy?.fullName || 'User'} · {event.performedByRole || 'Operator'}</Typography>
        <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{new Date(event.performedAt).toLocaleString()}</Typography>
      </Box>
    </Box>)}
  </Box>
}
