import { useEffect, useState } from 'react'
import api from '../services/api'
import { AuthContext } from './AuthContext'
import { dashboards, readStored, store, TOKEN_KEY } from './session'

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [restoreError, setRestoreError] = useState(false)
  const [retry, setRetry] = useState(0)

  function logout() {
    store(TOKEN_KEY, null)
    delete api.defaults.headers.common.Authorization
    setUser(null)
    setRestoreError(false)
  }

  useEffect(() => {
    let active = true
    const token = readStored(TOKEN_KEY)
    const interceptor = api.interceptors.response.use(response => response, error => {
      if (error.response?.status === 401 && error.config?.headers?.Authorization) logout()
      return Promise.reject(error)
    })
    async function restore() {
      if (!token) {
        if (active) setLoading(false)
        return
      }
      api.defaults.headers.common.Authorization = `Bearer ${token}`
      try {
        const { data } = await api.get('/auth/me')
        if (active) {
          if (!dashboards[data.user?.role]) logout()
          else setUser(data.user)
        }
      } catch (error) {
        if (active && error.response?.status !== 401) setRestoreError(true)
      } finally { if (active) setLoading(false) }
    }
    restore()
    return () => { active = false; api.interceptors.response.eject(interceptor) }
  }, [retry])

  async function login(email, password) {
    const { data } = await api.post('/auth/login', { email, password })
    const profile = await api.get('/auth/me', { headers: { Authorization: `Bearer ${data.accessToken}` } })
    if (!dashboards[profile.data.user?.role]) throw new Error('Unsupported account role')
    store(TOKEN_KEY, data.accessToken)
    api.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`
    setUser(profile.data.user)
    return profile.data.user
  }
  function retryRestore() { setLoading(true); setRestoreError(false); setRetry(value => value + 1) }
  async function changeTemporaryPassword(values) {
    const expectedRole = user?.role
    if (!dashboards[expectedRole]) {
      logout()
      throw new Error('Your account session could not be verified. Please sign in again.')
    }
    const { data } = await api.post('/auth/change-temporary-password', values)
    if (!data.accessToken) throw new Error('Your account session could not be verified. Please sign in again.')
    const profile = await api.get('/auth/me', { headers: { Authorization: `Bearer ${data.accessToken}` } })
    const updatedUser = profile.data.user
    if (!dashboards[updatedUser?.role] || updatedUser.role !== expectedRole || updatedUser.mustChangePassword) {
      logout()
      throw new Error('Your account session could not be verified. Please sign in again.')
    }
    store(TOKEN_KEY, data.accessToken)
    api.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`
    setUser(updatedUser)
    return updatedUser
  }

  return <AuthContext.Provider value={{ user, loading, restoreError, login, logout, retryRestore, changeTemporaryPassword }}>{children}</AuthContext.Provider>
}
