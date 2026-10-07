import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { dashboards } from '../auth/session'
export default function ProtectedRoute({ role, children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== role) return <Navigate to={dashboards[user.role]} replace />
  return children
}
