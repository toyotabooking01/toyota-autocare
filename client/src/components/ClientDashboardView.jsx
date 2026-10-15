import { Box, Button, Stack, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded'
import BuildOutlined from '@mui/icons-material/BuildOutlined'
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined'
import DirectionsCarOutlined from '@mui/icons-material/DirectionsCarOutlined'
import NotificationsNoneRounded from '@mui/icons-material/NotificationsNoneRounded'
import { Panel } from './DashboardParts'
import StatusChip, { StatusBadge } from './StatusChip'
import { RecordCard, RecordActions } from './RecordList'
import { CompactActionButton, DetailsButton } from './RowActions'
import { dateLabel } from '../pages/bookingDisplay'
import { vehicleName } from '../pages/dashboardData'
import { dateText, vehicleText } from '../pages/maintenanceDisplay'
import fortunerBanner from '../assets/fortuner-dashboard-banner.png'

function DashboardEmpty({ icon: Icon, title, description, action, to }) {
  return <Box className="dashboard-card-empty">
    <Box className="dashboard-card-icon"><Icon fontSize="small" /></Box>
    <Typography className="dashboard-card-title">{title}</Typography>
    <Typography className="dashboard-card-subtitle">{description}</Typography>
    {to && <Button component={Link} to={to} size="small" variant="outlined" className="dashboard-card-action">{action}<ArrowForwardRounded fontSize="small" /></Button>}
  </Box>
}

function ServiceCard({ booking }) {
  return <Panel className="client-dashboard-card" title="Current or upcoming service" to="/client/bookings" action="My bookings">
    {booking ? <RecordCard><Box className="record-card-copy">
      <Typography>{vehicleName(booking.vehicle)}</Typography>
      <Typography>{dateLabel(booking.bookingDate)} · {booking.bookingTime}{booking.assignedServiceBay?.name ? ` · ${booking.assignedServiceBay.name}` : ''}</Typography>
      <Typography>{(booking.services || []).map(item => item?.name).filter(Boolean).join(', ') || 'Service unavailable'}</Typography>
    </Box><RecordActions statuses={<StatusChip status={booking.status} />}><DetailsButton component={Link} to="/client/bookings" /></RecordActions></RecordCard>
      : <DashboardEmpty icon={CalendarMonthOutlined} title="No upcoming service" description="When you book a visit, its details will appear here." action="Book a service" to="/client/book-service" />}
  </Panel>
}

function MaintenanceCard({ reminder, vehicles }) {
  const vehicle = vehicles.find(item => item._id === reminder?.vehicle?._id) || reminder?.vehicle
  return <Panel className="client-dashboard-card" title="Next maintenance" to="/client/reminders" action="View maintenance">
    {reminder ? <><RecordCard entityType="service"><Box className="record-card-copy">
      <Typography>{vehicleText(reminder.vehicle)}</Typography>
      <Typography>{reminder.service?.name || 'Recommended service'} · {dateText(reminder.nextRecommendedServiceDate)}</Typography>
      <Typography>Last service: {dateText(reminder.lastServiceDate)}{Number.isFinite(vehicle?.currentMileage) ? ` · ${vehicle.currentMileage.toLocaleString('en-PH')} km current mileage` : ''}</Typography>
    </Box><RecordActions statuses={<StatusBadge label={reminder.status?.replaceAll('_', ' ') || 'Maintenance'} />}><DetailsButton component={Link} to="/client/reminders" /></RecordActions></RecordCard>
      <Box sx={{ mt: 1.5 }}><CompactActionButton component={Link} to="/client/book-service">Schedule a visit</CompactActionButton></Box></>
      : <DashboardEmpty icon={BuildOutlined} title="No recommendation yet" description="Your next service recommendation will appear after a completed visit." action="Plan a visit" to="/client/book-service" />}
  </Panel>
}

function VehiclesCard({ vehicles, latest }) {
  return <Panel className="client-dashboard-card" title={`My vehicles (${vehicles.length})`} to="/client/vehicles" action="View all">
    {vehicles.length ? <Stack spacing={1.25}>{vehicles.slice(0, 3).map(vehicle => <RecordCard key={vehicle._id}>
      <Box className="record-card-copy"><Typography>{vehicle.make} {vehicle.model}</Typography><Typography>{vehicle.year} · {vehicle.plateNumber}</Typography>
        <Typography>{Number.isFinite(vehicle.currentMileage) ? `${vehicle.currentMileage.toLocaleString('en-PH')} km` : 'Mileage not recorded'}</Typography></Box>
      <RecordActions statuses={<StatusBadge label="Current" />}><DetailsButton component={Link} to="/client/vehicles" /></RecordActions>
    </RecordCard>)}</Stack>
      : <DashboardEmpty icon={DirectionsCarOutlined} title="No vehicles added" description="Add your Toyota to keep its service information together." action="Add a vehicle" to="/client/vehicles" />}
    {latest && <Typography className="dashboard-card-meta">Latest service: {(latest.services || []).map(item => item?.name).filter(Boolean).join(', ') || 'Service'} · {dateLabel(latest.bookingDate)}</Typography>}
  </Panel>
}

function NotificationsCard({ notifications, unread }) {
  return <Panel className="client-dashboard-card" title={unread ? `Notifications (${unread} unread)` : 'Notifications'} to="/client/notifications" action="View all">
    {notifications.length ? <Stack spacing={1.25}>{notifications.slice(0, 3).map(item => <RecordCard key={item._id} entityType="notification" sx={{ bgcolor: item.isRead ? 'var(--surface)' : 'var(--accent-soft)' }}>
      <Box className="record-card-copy"><Typography>{item.title}</Typography><Typography>{item.message}</Typography>
        {item.createdAt && <Typography>{new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))}</Typography>}</Box>
      <RecordActions statuses={!item.isRead && <StatusBadge label="New" />}><DetailsButton component={Link} to="/client/notifications" /></RecordActions>
    </RecordCard>)}</Stack>
      : <DashboardEmpty icon={NotificationsNoneRounded} title="You're all caught up" description="Updates about bookings and maintenance will appear here." />}
  </Panel>
}

export default function ClientDashboardView({ heading, current, nextReminder, vehicles, notifications, latest, unread }) {
  return <>{heading}
    <Box className="dashboard-hero" role="region" aria-label="Toyota AutoCare service banner">
      <Box component="img" className="dashboard-hero-image" src={fortunerBanner} alt="Silver Toyota Fortuner on a mountain road at sunset" />
      <Box className="dashboard-hero-shade" aria-hidden="true" />
      <Box className="dashboard-hero-content">
        <Typography className="dashboard-hero-eyebrow">TOYOTA AUTOCARE</Typography>
        <Typography component="h2" className="dashboard-hero-title">Reliable care<br />for every journey.</Typography>
        <Typography className="dashboard-hero-description">Keep your Toyota in top condition with trusted service and easy online booking.</Typography>
        <Button className="dashboard-hero-button" component={Link} to="/client/book-service" variant="contained" endIcon={<ArrowForwardRounded />}>Book a service</Button>
      </Box>
    </Box>
    <Box className="client-dashboard-grid">
      <ServiceCard booking={current} />
      <MaintenanceCard reminder={nextReminder} vehicles={vehicles} />
      <VehiclesCard vehicles={vehicles} latest={latest} />
      <NotificationsCard notifications={notifications} unread={unread} />
    </Box>
  </>
}
