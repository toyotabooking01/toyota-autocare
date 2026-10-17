import { Box, Button, Stack, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import { Calendar, Car, ClockRotateRight, NavArrowRight, Tools } from 'iconoir-react'
import { MetricCards, Panel } from './DashboardParts'
import { MinimalStatus } from './StatusChip'
import { dateLabel } from '../pages/bookingDisplay'
import { vehicleName } from '../pages/dashboardData'
import { dateText, vehicleText } from '../pages/maintenanceDisplay'
import { QuietDetailsButton } from './RowActions'

function Empty({ children, to, action }) {
  return <Box className="client-dashboard-empty"><Typography>{children}</Typography>{to && <Button component={Link} to={to} size="small">{action}<NavArrowRight width={15} height={15} /></Button>}</Box>
}

export default function ClientDashboardView({ heading, current, upcoming, nextReminder, vehicles, latest, historyCount, activeCount }) {
  const metrics = [
    { label: 'My Vehicle', value: vehicles.length, detail: 'Registered vehicles', tone: 'blue', to: '/client/vehicles', icon: <Car width={20} height={20} strokeWidth={1.7} /> },
    { label: 'Upcoming Service', value: upcoming ? 1 : 0, detail: upcoming ? 'Scheduled visit' : 'No scheduled visit', tone: 'amber', to: '/client/bookings', icon: <Calendar width={20} height={20} strokeWidth={1.7} /> },
    { label: 'Active Booking', value: activeCount, detail: 'Open appointments', tone: 'green', to: '/client/bookings', icon: <Tools width={20} height={20} strokeWidth={1.7} /> },
    { label: 'Service History', value: historyCount, detail: 'Completed services', tone: 'purple', to: '/client/service-history', icon: <ClockRotateRight width={20} height={20} strokeWidth={1.7} /> },
  ]
  return <>{heading}<MetricCards items={metrics} />
    <Box className="client-dashboard-grid">
      <Panel className="client-dashboard-card" title="Upcoming service" to="/client/bookings" action="View bookings">
        {current ? <Box className="client-dashboard-record">
          <Box><Typography className="client-dashboard-primary">{vehicleName(current.vehicle)}</Typography>
            <Typography className="client-dashboard-secondary">{dateLabel(current.bookingDate)} · {current.bookingTime}{current.assignedServiceBay?.name ? ` · ${current.assignedServiceBay.name}` : ''}</Typography>
            <Typography className="client-dashboard-secondary">{(current.services || []).map(item => item?.name).filter(Boolean).join(', ') || 'Service details unavailable'}</Typography></Box>
          <MinimalStatus label={String(current.status || '').replaceAll('_', ' ').replace(/^\w/, letter => letter.toUpperCase())} status={current.status} />
          <QuietDetailsButton component={Link} to={`/client/bookings?open=${current._id}`} />
        </Box> : <Empty to="/client/book-service" action="Book Service">No upcoming service</Empty>}
      </Panel>
      <Panel className="client-dashboard-card" title="Next maintenance" to="/client/reminders" action="View maintenance">
        {nextReminder ? <Box className="client-dashboard-record">
          <Box><Typography className="client-dashboard-primary">{vehicleText(nextReminder.vehicle)}</Typography>
            <Typography className="client-dashboard-secondary">{nextReminder.service?.name || 'Recommended service'} · {nextReminder.nextRecommendedServiceDate ? dateText(nextReminder.nextRecommendedServiceDate) : 'Date unavailable'}</Typography></Box>
          <MinimalStatus label={String(nextReminder.displayStatus || nextReminder.status || 'Upcoming').replaceAll('_', ' ').replace(/^\w/, letter => letter.toUpperCase())} status={nextReminder.displayStatus || nextReminder.status} />
        </Box> : <Empty>No maintenance recommendation yet</Empty>}
      </Panel>
      <Panel className="client-dashboard-card" title="Quick actions">
        <Stack className="client-dashboard-actions" direction={{ xs: 'column', sm: 'row' }}>
          <Button component={Link} to="/client/book-service" variant="contained">Book Service</Button>
          <Button component={Link} to="/client/vehicles" variant="outlined">Manage My Vehicle</Button>
        </Stack>
        {latest && <Typography className="client-dashboard-latest">Latest completed visit · {dateLabel(latest.bookingDate)} · {(latest.services || []).map(item => item?.name).filter(Boolean).join(', ') || 'Service'}</Typography>}
      </Panel>
      {vehicles.length === 0 && <Panel className="client-dashboard-card" title="My Vehicle"><Empty to="/client/vehicles" action="Add Vehicle">Add your vehicle to see its service information here.</Empty></Panel>}
    </Box>
  </>
}
