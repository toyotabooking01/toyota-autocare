import DashboardOutlined from '@mui/icons-material/DashboardOutlined'
import DirectionsCarOutlined from '@mui/icons-material/DirectionsCarOutlined'
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined'
import AssignmentOutlined from '@mui/icons-material/AssignmentOutlined'
import NotificationsNoneOutlined from '@mui/icons-material/NotificationsNoneOutlined'
import BuildOutlined from '@mui/icons-material/BuildOutlined'
import GarageOutlined from '@mui/icons-material/GarageOutlined'
import BarChartOutlined from '@mui/icons-material/BarChartOutlined'
import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined'
import PlaylistAddOutlined from '@mui/icons-material/PlaylistAddOutlined'

const item = (path, label, icon) => ({ path, label, icon })
export const roleNavigation = {
  client: [
    item('dashboard', 'Dashboard', DashboardOutlined),
    item('vehicles', 'My Vehicles', DirectionsCarOutlined),
    item('book-service', 'Book Service', CalendarMonthOutlined),
    item('bookings', 'My Bookings', AssignmentOutlined),
    item('reminders', 'Maintenance', AccessTimeOutlined),
  ],
  mechanic: [
    item('dashboard', 'Dashboard', DashboardOutlined),
    item('jobs', 'My Jobs', AssignmentOutlined),
    item('active-job', 'Active Job', BuildOutlined),
  ],
  admin: [
    item('dashboard', 'Dashboard', DashboardOutlined),
    item('bookings', 'Booking Monitoring', CalendarMonthOutlined),
    item('staff', 'Staff Monitoring', AssignmentOutlined),
    item('mechanics', 'Mechanics', BuildOutlined),
    item('customers', 'Customers & Vehicles', DirectionsCarOutlined),
    item('services', 'Services', AssignmentOutlined),
    item('schedules', 'Schedules', AccessTimeOutlined),
    item('service-bays', 'Service Bays', GarageOutlined),
    item('job-orders', 'Service Monitoring', AssignmentOutlined),
    item('reminders', 'Reminders', NotificationsNoneOutlined),
    item('reports', 'Reports', BarChartOutlined),
  ],
  staff: [
    item('dashboard', 'Dashboard', DashboardOutlined),
    item('bookings', 'Bookings', CalendarMonthOutlined),
    item('walk-in', 'Walk-In', PlaylistAddOutlined),
    item('customers', 'Customers', DirectionsCarOutlined),
    item('job-orders', 'Job Coordination', AssignmentOutlined),
    item('transactions', 'Transactions', BarChartOutlined),
  ],
}
export const roleLabels = { client: 'Client', mechanic: 'Mechanic', staff: 'Staff', admin: 'Administrator' }
