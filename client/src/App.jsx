import { useState } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { Alert, Button, CircularProgress } from '@mui/material'
import { useAuth } from './auth/AuthContext'
import { dashboards } from './auth/session'
import AuthLayout from './components/AuthLayout'
import ProtectedRoute from './components/ProtectedRoute'
import ApplicationLayout from './layouts/ApplicationLayout'
import ModuleFoundation from './pages/ModuleFoundation'
import AdminMasterData from './pages/AdminMasterData'
import AdminMechanics from './pages/AdminMechanics'
import ClientVehicles from './pages/ClientVehicles'
import AdminSchedules from './pages/AdminSchedules'
import ClientBookService from './pages/ClientBookService'
import BookingList from './pages/BookingList'
import AdminWalkIn from './pages/AdminWalkIn'
import JobOrders from './pages/JobOrders'
import ActiveJob from './pages/ActiveJob'
import NotificationsPage from './pages/NotificationsPage'
import MaintenanceReminders from './pages/MaintenanceReminders'
import AdminReports from './pages/AdminReports'
import { ClientDashboard, MechanicDashboard, AdminDashboard } from './pages/RoleDashboards'
import { roleNavigation } from './app/navigation'
import { ForgotPassword, Login, Register, ResetPassword, VerifyCode } from './pages/AuthPages'
import './App.css'

export default function App() {
  const { user, loading, restoreError, retryRestore, logout } = useAuth()
  const [resetGrant, setResetGrant] = useState(null)
  const home = user ? dashboards[user.role] : '/login'
  let content
  if (loading) content = <div className="session-state" role="status"><CircularProgress size={28} /><p>Restoring your session…</p></div>
  else if (restoreError) content = <div className="form-card"><Alert severity="warning">We couldn’t check your session. Please try again.</Alert><Button onClick={retryRestore}>Retry</Button><Button onClick={logout}>Back to sign in</Button></div>
  else return <Routes>
    <Route element={<AuthLayout><Outlet /></AuthLayout>}>
    <Route path="/login" element={user ? <Navigate to={home} replace /> : <Login />} />
    <Route path="/register" element={user ? <Navigate to={home} replace /> : <Register />} />
    <Route path="/verify-email" element={<VerifyCode key="email" />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/verify-reset" element={<VerifyCode key="reset" reset onResetGrant={setResetGrant} />} />
    <Route path="/reset-password" element={<ResetPassword grant={resetGrant} clearGrant={() => setResetGrant(null)} />} />
    </Route>
    {Object.keys(dashboards).map(role => <Route key={role} path={`/${role}`} element={<ProtectedRoute role={role}><ApplicationLayout role={role} /></ProtectedRoute>}>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={role === 'client' ? <ClientDashboard /> : role === 'mechanic' ? <MechanicDashboard /> : <AdminDashboard />} />
      {roleNavigation[role].filter(item => item.path !== 'dashboard').map(item => <Route key={item.path} path={item.path} element={role === 'admin' && ['services', 'service-bays'].includes(item.path)
        ? <AdminMasterData key={item.path} kind={item.path === 'services' ? 'service' : 'bay'} />
        : role === 'admin' && item.path === 'mechanics' ? <AdminMechanics />
          : role === 'admin' && item.path === 'schedules' ? <AdminSchedules />
            : role === 'admin' && item.path === 'bookings' ? <BookingList role="admin" />
              : role === 'admin' && item.path === 'walk-in' ? <AdminWalkIn />
                : role === 'admin' && item.path === 'job-orders' ? <JobOrders role="admin" />
                  : role === 'mechanic' && item.path === 'jobs' ? <JobOrders role="mechanic" />
                    : role === 'mechanic' && item.path === 'active-job' ? <ActiveJob />
                      : role === 'admin' && item.path === 'reminders' ? <MaintenanceReminders role="admin" />
                        : role === 'admin' && item.path === 'reports' ? <AdminReports />
          : role === 'client' && item.path === 'vehicles' ? <ClientVehicles />
            : role === 'client' && item.path === 'book-service' ? <ClientBookService />
              : role === 'client' && item.path === 'bookings' ? <BookingList role="client" />
                : role === 'client' && item.path === 'notifications' ? <NotificationsPage />
                  : role === 'client' && item.path === 'reminders' ? <MaintenanceReminders role="client" />
            : <ModuleFoundation role={role} label={item.label} icon={item.icon} />} />)}
      <Route path="*" element={<Navigate to={dashboards[role]} replace />} />
    </Route>)}
    <Route path="*" element={<Navigate to={home} replace />} />
  </Routes>
  return <AuthLayout>{content}</AuthLayout>
}
