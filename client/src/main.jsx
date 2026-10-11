import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import AppThemeProvider from './components/AppThemeProvider'
import AuthProvider from './auth/AuthProvider'
import ConfirmationProvider from './components/ConfirmationProvider'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppThemeProvider>
      <BrowserRouter>
        <AuthProvider><ConfirmationProvider><App /></ConfirmationProvider></AuthProvider>
      </BrowserRouter>
    </AppThemeProvider>
  </StrictMode>,
)
