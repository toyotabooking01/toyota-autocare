import { DetailGrid, DetailInfo, DetailSection, DetailVehicle, ServiceEstimate } from './RecordDetails'
import { dateLabel } from '../pages/bookingDisplay'
import PaymentPanel from './PaymentPanel'

export default function BookingRecordDetails({ booking, business = false, total }) {
  return <>
    <DetailSection title="Booking overview">
      <DetailInfo items={[
        ['Booking source', booking.bookingType === 'walk-in' ? 'Walk-In' : 'Online'],
        ['Schedule', `${dateLabel(booking.bookingDate)} · ${booking.bookingTime || 'Time not recorded'}`],
        ...(business && booking.createdByStaff ? [[`Created by ${booking.createdByRole === 'admin' ? 'Admin' : 'Staff'}`, [booking.createdByStaff.fullName, booking.createdByRole === 'admin' ? '' : booking.createdByStaff.staffId].filter(Boolean).join(' · ')]] : []),
        ...(business && booking.lastProcessedBy ? [['Last action by', `${booking.lastProcessedBy.fullName} (${booking.lastProcessedByRole || booking.lastProcessedBy.role || 'operator'})`]] : []),
        ...(business && booking.assignedMechanic ? [['Assigned Mechanic', booking.assignedMechanic.fullName]] : []),
      ]} />
    </DetailSection>
    <DetailGrid>
      {business && <DetailSection title="Customer"><DetailInfo items={[["Client", booking.client?.fullName],
        ...(booking.client?.email !== undefined ? [['Email', booking.client.email || 'No email']] : []),
        ...(booking.client?.phone !== undefined ? [['Phone', booking.client.phone]] : []),
      ]} /></DetailSection>}
      <DetailSection title="Vehicle"><DetailVehicle vehicle={booking.vehicle} /></DetailSection>
    </DetailGrid>
    <ServiceEstimate services={booking.services} total={total} />
    {booking._id && <PaymentPanel bookingId={booking._id} bookingStatus={booking.status} role={business ? 'staff' : 'client'} />}
    {booking.concern && <DetailSection title="Customer concern"><DetailInfo items={[["Concern", booking.concern]]} /></DetailSection>}
    {business && booking.activity?.length > 0 && <DetailSection title="Activity"><DetailInfo items={booking.activity.slice(-8).reverse().map(entry => [entry.action.replaceAll('_', ' ').replaceAll('-', ' '), `${entry.performedBy?.fullName || 'User'} (${entry.performedByRole}) · ${new Date(entry.performedAt).toLocaleString()}`])} /></DetailSection>}
  </>
}
