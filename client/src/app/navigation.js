import DashboardOutlined from '@mui/icons-material/DashboardOutlined'
import DirectionsCarOutlined from '@mui/icons-material/DirectionsCarOutlined'
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined'
import AssignmentOutlined from '@mui/icons-material/AssignmentOutlined'
import BuildOutlined from '@mui/icons-material/BuildOutlined'
import BarChartOutlined from '@mui/icons-material/BarChartOutlined'
import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined'
import PlaylistAddOutlined from '@mui/icons-material/PlaylistAddOutlined'
import { Activity, Archive, Bell, Calendar, Car, Clock, ClockRotateRight, GraphUp, Group, Industry, TaskList, Tools, ViewGrid } from 'iconoir-react'

const item = (path, label, icon) => ({ path, label, icon })
export const roleNavigation = {
  client: [
    item('dashboard', 'Dashboard', DashboardOutlined),
    item('vehicles', 'My Vehicles', DirectionsCarOutlined),
    item('book-service', 'Book Service', CalendarMonthOutlined),
    item('bookings', 'My Bookings', AssignmentOutlined),
    item('service-history', 'Service History', AssignmentOutlined),
    item('reminders', 'Maintenance', AccessTimeOutlined),
  ],
  mechanic: [
    item('dashboard', 'Dashboard', DashboardOutlined),
    item('jobs', 'My Jobs', AssignmentOutlined),
    item('active-job', 'Active Job', BuildOutlined),
  ],
  admin: [
    item('dashboard', 'Dashboard', ViewGrid),
    item('bookings', 'Booking Monitoring', Calendar),
    item('staff', 'Staff Monitoring', Group),
    item('mechanics', 'Mechanics', Tools),
    item('customers', 'Customer Vehicle Monitoring', Car),
    item('services', 'Services', TaskList),
    item('schedules', 'Schedules', Clock),
    item('service-bays', 'Service Bays', Industry),
    item('job-orders', 'Service Monitoring', Activity),
    item('service-history', 'Service History', ClockRotateRight),
    item('reminders', 'Reminders', Bell),
    item('reports', 'Reports', GraphUp),
    item('archive', 'Archive', Archive),
  ],
  staff: [
    item('dashboard', 'Dashboard', DashboardOutlined),
    item('bookings', 'Bookings', CalendarMonthOutlined),
    item('walk-in', 'Walk-In', PlaylistAddOutlined),
    item('customers', 'Customers', DirectionsCarOutlined),
    item('job-orders', 'Job Coordination', AssignmentOutlined),
    item('service-history', 'Service History', AssignmentOutlined),
    item('transactions', 'Transactions', BarChartOutlined),
  ],
}
export const roleLabels = { client: 'Client', mechanic: 'Mechanic', staff: 'Staff', admin: 'Administrator' }
