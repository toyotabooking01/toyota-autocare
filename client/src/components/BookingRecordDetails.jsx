import { DetailGrid, DetailInfo, DetailSection, DetailVehicle, ServiceEstimate } from './RecordDetails'
import { dateLabel } from '../pages/bookingDisplay'

export default function BookingRecordDetails({ booking, business = false, total }) {
  return <>
    <DetailSection title="Booking overview">
      <DetailInfo items={[
        ['Booking source', booking.bookingType === 'walk-in' ? 'Walk-In' : 'Online'],
        ['Schedule', `${dateLabel(booking.bookingDate)} · ${booking.bookingTime || 'Time not recorded'}`],
        ...(business && booking.createdByStaff ? [['Created by Staff', [booking.createdByStaff.fullName, booking.createdByStaff.staffId].filter(Boolean).join(' · ')]] : []),
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
    {booking.concern && <DetailSection title="Customer concern"><DetailInfo items={[["Concern", booking.concern]]} /></DetailSection>}
  </>
}
