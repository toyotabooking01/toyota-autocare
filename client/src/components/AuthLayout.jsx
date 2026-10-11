import { Link, useLocation } from 'react-router-dom'
import { Button } from '@mui/material'
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded'
import BuildOutlined from '@mui/icons-material/BuildOutlined'
import HistoryRounded from '@mui/icons-material/HistoryRounded'
import NotificationsNoneRounded from '@mui/icons-material/NotificationsNoneRounded'
import ThemeToggle from './ThemeToggle'

export default function AuthLayout({ children }) {
  const { pathname } = useLocation()
  return <div className={`site-wrap${pathname === '/register' ? ' site-wrap--registration' : ''}`}>
    <header className="site-header">
      <Link className="brand" to="/login"><span>Toyota</span> AutoCare<span className="brand-dot">.</span></Link>
      <div className="header-right"><span className="header-note">A little care. A longer journey.</span>
        <ThemeToggle />
        {pathname !== '/login' && <Button component={Link} to="/login" variant="outlined" size="small" startIcon={<ArrowBackRounded />}>Back to sign in</Button>}
      </div>
    </header>
    <main className="auth-layout">
      <aside className="journey-panel">
        <div className="journey-copy"><span className="red-line" /><p className="eyebrow">TOYOTA AUTOCARE</p>
          <h1>Reliable care<br />for every journey.</h1>
          <p>Your Toyota deserves expert care.<br />We make staying connected simple.</p>
        </div>
        <div className="benefits">
          <div><span><BuildOutlined /></span><p>Care you can count on</p></div>
          <div><span><HistoryRounded /></span><p>Your vehicle’s story, in one place</p></div>
          <div><span><NotificationsNoneRounded /></span><p>Peace of mind, mile after mile</p></div>
        </div>
      </aside>
      <section className="form-region" aria-label="Account access">{children}</section>
    </main>
    <footer className="site-footer"><span>Toyota AutoCare</span><span>Expert service. Genuine care.</span></footer>
  </div>
}
