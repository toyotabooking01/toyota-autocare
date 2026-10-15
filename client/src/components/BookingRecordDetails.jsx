import { DetailGrid, DetailInfo, DetailSection, DetailVehicle, ServiceEstimate } from './RecordDetails'
import { dateLabel } from '../pages/bookingDisplay'
import PaymentPanel from './PaymentPanel'
import AdditionalWorkPanel from './AdditionalWorkPanel'

export default function BookingRecordDetails({ booking, business = false, total, role, onPaymentDecision }) {
  const bookedServices = booking.estimatedServiceItems?.length
    ? booking.estimatedServiceItems.map(item => ({ _id: item.serviceId, name: item.name, estimatedPrice: item.priceCents / 100 }))
    : booking.services
  return <>
    <DetailSection title="Booking overview">
      <DetailInfo items={[
        ['Booking source', booking.bookingType === 'walk-in' ? 'Walk-In' : 'Online'],
        ['Schedule', `${dateLabel(booking.bookingDate)} · ${booking.bookingTime || 'Time not recorded'}`],
        ...(booking.holdReleaseReason === 'expired' ? [['Downpayment', 'Downpayment window expired']] : []),
        ...(business && booking.createdByStaff ? [[`Created by ${booking.createdByRole === 'admin' ? 'Admin' : 'Staff'}`, [booking.createdByStaff.fullName, booking.createdByRole === 'admin' ? '' : booking.createdByStaff.staffId].filter(Boolean).join(' · ')]] : []),
        ...(business && booking.lastProcessedBy ? [['Last action by', `${booking.lastProcessedBy.fullName} (${booking.lastProcessedByRole || booking.lastProcessedBy.role || 'operator'})`]] : []),
        ...(business && booking.assignedMechanic ? [['Assigned Mechanic', booking.assignedMechanic.fullName]] : []),
        ...(booking.status === 'completed' ? [['Release Status', 'Vehicle Released'],
          ...(booking.releasedAt ? [['Released At', new Date(booking.releasedAt).toLocaleString()]] : []),
          ...(booking.releasedByRole ? [['Released By', `${booking.lastProcessedBy?.fullName || 'Service center'} (${booking.releasedByRole === 'admin' ? 'Admin' : 'Staff'})`]] : [])] : []),
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
    {booking._id && <PaymentPanel bookingId={booking._id} bookingStatus={booking.status}
      role={role || (business ? 'staff' : 'client')} onDecision={onPaymentDecision} />}
    {booking._id && ['in_service', 'final_inspection', 'ready_for_release', 'completed'].includes(booking.status)
      && <AdditionalWorkPanel bookingId={booking._id} bookingStatus={booking.status} mechanicName={booking.assignedMechanic?.fullName}
        role={role || (business ? 'staff' : 'client')} />}
    {booking.concern && <DetailSection title="Customer concern"><DetailInfo items={[["Concern", booking.concern]]} /></DetailSection>}
    {business && booking.activity?.length > 0 && <DetailSection title="Activity"><DetailInfo items={booking.activity.slice(-8).reverse().map(entry => [entry.action.replaceAll('_', ' ').replaceAll('-', ' '), `${entry.performedBy?.fullName || 'User'} (${entry.performedByRole}) · ${new Date(entry.performedAt).toLocaleString()}`])} /></DetailSection>}
  </>
}
