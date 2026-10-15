import { Link, useLocation } from 'react-router-dom'
import BuildOutlined from '@mui/icons-material/BuildOutlined'
import HistoryRounded from '@mui/icons-material/HistoryRounded'
import NotificationsNoneRounded from '@mui/icons-material/NotificationsNoneRounded'
import BrandMark from './BrandMark'
import fortunerHero from '../assets/fortuner-full-hero.png'

export default function AuthLayout({ children }) {
  const { pathname } = useLocation()
  const isLogin = pathname === '/login'
  return <div className={`site-wrap site-wrap--auth${isLogin ? ' site-wrap--login' : ''}${pathname === '/register' ? ' site-wrap--registration' : ''}`}>
    <img className="auth-hero-image" src={fortunerHero} alt="" aria-hidden="true" />
    <header className="site-header">
      <Link className="brand" to="/login"><BrandMark className="brand-mark" /><span>Toyota</span> AutoCare<span className="brand-dot">.</span></Link>
      <span className="header-note">A little care. A longer journey.</span>
    </header>
    <main className="auth-layout">
      <aside className="journey-panel auth-marketing">
        <div className="journey-copy"><span className="red-line" /><p className="eyebrow">TOYOTA AUTOCARE</p>
          <h1>Reliable care<br />for every journey.</h1>
          <p>Your Toyota deserves expert care.<br />We make staying connected simple.</p>
        </div>
        <div className="benefits">
          <div><span><BuildOutlined /></span><p>Care you can count on<small>Expert service from Toyota specialists.</small></p></div>
          <div><span><HistoryRounded /></span><p>Your vehicle’s story, in one place<small>Service history, bookings and more.</small></p></div>
          <div><span><NotificationsNoneRounded /></span><p>Peace of mind, mile after mile<small>Keep your Toyota in top condition.</small></p></div>
        </div>
      </aside>
      <section className="form-region auth-card-wrapper" aria-label="Account access">{children}</section>
    </main>
    <footer className="site-footer"><span>Toyota AutoCare</span><span>Expert service. Genuine care.</span></footer>
  </div>
}
