import { Link, useLocation } from 'react-router-dom'
import BrandMark from './BrandMark'
import workshopHero from '../assets/autocare-workshop-hero.png'

export default function AuthLayout({ children }) {
  const { pathname } = useLocation()
  const isLogin = pathname === '/login'
  const routeClass = pathname === '/register' ? 'site-wrap--registration' : `site-wrap--${pathname.slice(1).replaceAll('/', '-')}`

  return <div className={`site-wrap site-wrap--auth ${routeClass}${isLogin ? ' site-wrap--login' : ''}`}>
    <img className="auth-hero-image" src={workshopHero} alt="" aria-hidden="true" />
    <header className="site-header">
      <Link className="brand" to="/" aria-label="Toyota AutoCare — Home"><BrandMark className="brand-mark" /><span>Toyota</span> AutoCare<span className="brand-dot">.</span></Link>
      <span className="header-note">A little care. A longer journey.</span>
    </header>
    <main className="auth-layout">
      <aside className="journey-panel auth-marketing">
        <div className="journey-copy">
          <p className="eyebrow">TOYOTA AUTOCARE</p>
          <h1>Vehicle care,<br />made simple<span className="login-red-period">.</span></h1>
          <p>Book services, track maintenance, and manage your vehicle account in one place.</p>
        </div>
      </aside>
      <section className="form-region auth-card-wrapper" aria-label="Account access">{children}</section>
    </main>
    <footer className="site-footer"><span>Toyota AutoCare</span><span>Expert service. Genuine care.</span></footer>
  </div>
}
