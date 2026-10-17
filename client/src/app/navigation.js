import { Activity, Archive, Bell, Calendar, Car, Clock, ClockRotateRight, GraphUp, Group, Industry, TaskList, Tools, ViewGrid } from 'iconoir-react'

const item = (path, label, icon) => ({ path, label, icon })
export const roleNavigation = {
  client: [
    item('dashboard', 'Dashboard', ViewGrid),
    item('vehicles', 'My Vehicle', Car),
    item('book-service', 'Book Service', Calendar),
    item('bookings', 'My Bookings', TaskList),
    item('service-history', 'Service History', ClockRotateRight),
    item('reminders', 'Maintenance', Tools),
  ],
  mechanic: [
    item('dashboard', 'Dashboard', ViewGrid),
    item('jobs', 'My Jobs', TaskList),
    item('active-job', 'Active Job', Tools),
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
    item('dashboard', 'Dashboard', ViewGrid),
    item('bookings', 'Bookings', Calendar),
    item('walk-in', 'Walk-In', TaskList),
    item('customers', 'Customers', Car),
    item('job-orders', 'Job Coordination', Activity),
    item('service-history', 'Service History', ClockRotateRight),
    item('transactions', 'Transactions', GraphUp),
  ],
}
export const roleLabels = { client: 'Client', mechanic: 'Mechanic', staff: 'Staff', admin: 'Administrator' }
