import { useState } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { Alert, Button, CircularProgress } from '@mui/material'
import { useAuth } from './auth/AuthContext'
import { dashboards, accountHome } from './auth/session'
import ForcedPasswordChange from './pages/ForcedPasswordChange'
import AuthLayout from './components/AuthLayout'
import ProtectedRoute from './components/ProtectedRoute'
import ApplicationLayout from './layouts/ApplicationLayout'
import AdminMasterData from './pages/AdminMasterData'
import AdminMechanics from './pages/AdminMechanics'
import ClientVehicles from './pages/ClientVehicles'
import AdminSchedules from './pages/AdminSchedules'
import ClientBookService from './pages/ClientBookService'
import BookingList from './pages/BookingList'
import StaffWalkIn from './pages/StaffWalkIn'
import JobOrders from './pages/JobOrders'
import ActiveJob from './pages/ActiveJob'
import NotificationsPage from './pages/NotificationsPage'
import MaintenanceReminders from './pages/MaintenanceReminders'
import ServiceHistory from './pages/ServiceHistory'
import AdminReports from './pages/AdminReports'
import AdminArchive from './pages/AdminArchive'
import { ClientDashboard, MechanicDashboard, AdminDashboard, StaffDashboard } from './pages/RoleDashboards'
import { CustomersDirectory, StaffDirectory } from './pages/PeopleDirectory'
import { roleNavigation } from './app/navigation'
import { AccountSettings, HelpSupport, MyProfile } from './pages/AccountPages'
import { ForgotPassword, Login, Register, ResetPassword, VerifyCode } from './pages/AuthPages'
import LandingPage from './pages/LandingPage'
import './App.css'
import './redesign.css'
import './login.css'
import './portal.css'

export default function App() {
  const { user, loading, restoreError, retryRestore, logout } = useAuth()
  const { pathname } = useLocation()
  const [resetGrant, setResetGrant] = useState(null)
  const home = accountHome(user)
  let content
  if (loading && pathname !== '/') content = <div className="session-state" role="status"><CircularProgress size={28} /><p>Restoring your session…</p></div>
  else if (restoreError && pathname !== '/') content = <div className="form-card"><Alert severity="warning">We couldn’t check your session. Please try again.</Alert><Button onClick={retryRestore}>Retry</Button><Button onClick={logout}>Back to sign in</Button></div>
  else return <Routes>
    <Route path="/" element={<LandingPage />} />
    <Route element={<AuthLayout><Outlet /></AuthLayout>}>
    <Route path="/change-password" element={!user ? <Navigate to="/login" replace /> : user.mustChangePassword ? <ForcedPasswordChange /> : <Navigate to={home} replace />} />
    <Route path="/login" element={user ? <Navigate to={home} replace /> : <Login />} />
    <Route path="/register" element={user ? <Navigate to={home} replace /> : <Register />} />
    <Route path="/verify-email" element={<VerifyCode key="email" />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/verify-reset" element={<VerifyCode key="reset" reset onResetGrant={setResetGrant} />} />
    <Route path="/reset-password" element={<ResetPassword grant={resetGrant} clearGrant={() => setResetGrant(null)} />} />
    </Route>
    {Object.keys(dashboards).map(role => <Route key={role} path={`/${role}`} element={<ProtectedRoute role={role}><ApplicationLayout role={role} /></ProtectedRoute>}>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={role === 'client' ? <ClientDashboard /> : role === 'mechanic' ? <MechanicDashboard /> : role === 'staff' ? <StaffDashboard /> : <AdminDashboard />} />
      <Route path="profile" element={<MyProfile role={role} />} />
      <Route path="account-settings" element={<AccountSettings role={role} />} />
      {role === 'client' && <Route path="help-support" element={<HelpSupport />} />}
      <Route path="notifications" element={<NotificationsPage />} />
      {role === 'admin' && <Route path="walk-in" element={<StaffWalkIn role="admin" />} />}
      {roleNavigation[role].filter(item => item.path !== 'dashboard').map(item => <Route key={item.path} path={item.path} element={role === 'admin' && ['services', 'service-bays'].includes(item.path)
        ? <AdminMasterData key={item.path} kind={item.path === 'services' ? 'service' : 'bay'} />
        : item.path === 'service-history' ? <ServiceHistory role={role} />
        : role === 'admin' && item.path === 'mechanics' ? <AdminMechanics />
          : role === 'admin' && item.path === 'staff' ? <StaffDirectory />
            : ['admin', 'staff'].includes(role) && item.path === 'customers' ? <CustomersDirectory role={role} />
          : role === 'admin' && item.path === 'schedules' ? <AdminSchedules />
            : ['admin', 'staff'].includes(role) && item.path === 'bookings' ? <BookingList role={role} />
              : role === 'staff' && item.path === 'walk-in' ? <StaffWalkIn role="staff" />
                : ['admin', 'staff'].includes(role) && item.path === 'job-orders' ? <JobOrders role={role} />
                  : role === 'staff' && item.path === 'transactions' ? <JobOrders role="staff" view="transactions" />
                  : role === 'mechanic' && item.path === 'jobs' ? <JobOrders role="mechanic" />
                    : role === 'mechanic' && item.path === 'active-job' ? <ActiveJob />
                      : role === 'admin' && item.path === 'reminders' ? <MaintenanceReminders role="admin" />
                        : role === 'admin' && item.path === 'reports' ? <AdminReports />
                          : role === 'admin' && item.path === 'archive' ? <AdminArchive />
          : role === 'client' && item.path === 'vehicles' ? <ClientVehicles />
            : role === 'client' && item.path === 'book-service' ? <ClientBookService />
              : role === 'client' && item.path === 'bookings' ? <BookingList role="client" />
                  : role === 'client' && item.path === 'reminders' ? <MaintenanceReminders role="client" />
            : <Navigate to={dashboards[role]} replace />} />)}
      <Route path="*" element={<Navigate to={dashboards[role]} replace />} />
    </Route>)}
    <Route path="*" element={<Navigate to={home} replace />} />
  </Routes>
  return <AuthLayout>{content}</AuthLayout>
}
