import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, Calendar, Car, CheckCircle, Clock, Menu, NavArrowDown,
  Search, ShieldCheck, Wrench, Xmark, Book, Settings,
} from 'iconoir-react'
import { useAuth } from '../auth/AuthContext'
import { accountHome } from '../auth/session'
import { PolicyDialog } from '../components/RegistrationConsent'
import workshopHero from '../assets/autocare-workshop-hero.png'
import serviceCenter from '../assets/landing-service-center.jpg'
import maintenanceDetail from '../assets/landing-maintenance-detail.jpg'
import vehicleCta from '../assets/landing-vehicle-cta.jpg'
import './landing.css'

const serviceTypes = [
  { name: 'Maintenance', detail: 'Scheduled upkeep options in the service catalog.', icon: Wrench },
  { name: 'Diagnostic', detail: 'Diagnostic assessment options for vehicle concerns.', icon: Search },
]

const features = [
  { title: 'Easy Booking', detail: 'Choose a vehicle, service, and available time.', icon: Calendar },
  { title: 'Service History', detail: 'Review completed service records in your account.', icon: Book },
  { title: 'Service Updates', detail: 'Follow booking progress from your dashboard.', icon: Clock },
  { title: 'Maintenance Reminders', detail: 'Keep upcoming recommendations in view.', icon: CheckCircle },
]

const steps = [
  { title: 'Book a Service', detail: 'Choose your vehicle and available service options.', icon: Calendar },
  { title: 'Bring Your Vehicle', detail: 'Arrive for your confirmed date and time.', icon: Car },
  { title: 'We Take Care of It', detail: 'Follow service progress through your account.', icon: Wrench },
  { title: 'Get Back on the Road', detail: 'Review completed work and service records.', icon: CheckCircle },
]

const experience = [
  { title: 'Manage bookings', detail: 'Keep upcoming appointments and their status together.', icon: Calendar },
  { title: 'Follow service progress', detail: 'See updates as your service moves through the workflow.', icon: Settings },
  { title: 'Keep service records', detail: 'Return to completed service history from your account.', icon: Book },
]

const faqs = [
  { question: 'How do I book a service appointment?', answer: 'Sign in with a client account, choose one of your registered vehicles and available service options, then select an open date and time. Review the details and follow the booking steps to submit your request.' },
  { question: 'How can I check my booking status?', answer: 'Sign in and open My Bookings to review your appointments and their latest status.' },
  { question: 'Can I view my service history online?', answer: 'Yes. Sign in to your client account and open Service History to see completed service records available for your vehicles.' },
  { question: 'How do maintenance reminders work?', answer: 'Maintenance reminders are recommendations associated with your vehicle and service history. Sign in and open Maintenance to review the recommendations available to your account.' },
]

function SectionHeading({ id, eyebrow, title, description, centered = false }) {
  return <div className={`landing-section-heading${centered ? ' is-centered' : ''}`}>
    {eyebrow && <p className="landing-eyebrow">{eyebrow}</p>}
    <h2 id={id}>{title}</h2>
    {description && <p className="landing-section-description">{description}</p>}
  </div>
}

function BookServiceLink({ className = '', children, onClick }) {
  const { user } = useAuth()
  const destination = !user ? '/login' : user.mustChangePassword ? accountHome(user) : user.role === 'client' ? '/client/book-service' : accountHome(user)
  return <Link className={className} to={destination} onClick={onClick}>{children}</Link>
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [expandedFaq, setExpandedFaq] = useState(0)
  const [policyOpen, setPolicyOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)

  return <div className="landing-page">
    <header className="landing-header">
      <div className="landing-header-inner">
        <Link className="landing-brand" to="/" aria-label="Toyota AutoCare home" onClick={closeMenu}>
          <svg viewBox="0 0 64 40" aria-hidden="true"><ellipse cx="32" cy="20" rx="29" ry="17" /><ellipse cx="32" cy="20" rx="10" ry="17" /><ellipse cx="32" cy="13" rx="21" ry="8" /></svg>
          <span><b>Toyota</b> AutoCare</span>
        </Link>
        <button className="landing-menu-toggle" type="button" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} aria-controls="landing-navigation" onClick={() => setMenuOpen(open => !open)}>
          {menuOpen ? <Xmark /> : <Menu />}
        </button>
        <nav id="landing-navigation" className={`landing-navigation${menuOpen ? ' is-open' : ''}`} aria-label="Main navigation">
          <a className="is-active" href="#home" onClick={closeMenu}>Home</a>
          <a href="#services" onClick={closeMenu}>Services</a>
          <a href="#about" onClick={closeMenu}>About</a>
          <a href="#contact" onClick={closeMenu}>Contact</a>
          <Link className="landing-signin" to="/login" onClick={closeMenu}><span>Sign In</span><ArrowRight aria-hidden="true" /></Link>
        </nav>
      </div>
    </header>

    <main>
      <section className="landing-hero" id="home" aria-labelledby="landing-hero-title">
        <img className="landing-hero-image" src={workshopHero} alt="A vehicle being inspected in a bright automotive service workshop" fetchPriority="high" />
        <div className="landing-hero-shade" aria-hidden="true" />
        <div className="landing-hero-content">
          <p className="landing-hero-eyebrow">TOYOTA AUTOCARE</p>
          <h1 id="landing-hero-title">Vehicle care,<br />made simple<span>.</span></h1>
          <p className="landing-hero-copy">Book services, track maintenance, and manage your Toyota — all in one place.</p>
          <div className="landing-hero-actions">
            <BookServiceLink className="landing-button landing-button-primary"><Calendar aria-hidden="true" />Book a Service</BookServiceLink>
            <Link className="landing-button landing-button-secondary" to="/login"><span>Sign In</span><ArrowRight aria-hidden="true" /></Link>
          </div>
        </div>
      </section>

      <section className="landing-feature-strip" aria-label="AutoCare features">
        <div className="landing-feature-grid">
          {features.map(({ title, detail, icon: Icon }, index) => <article className="landing-feature" key={title}>
            <span className={`landing-feature-icon${index === 0 ? ' is-red' : ''}`}><Icon aria-hidden="true" /></span>
            <div><h2>{title}</h2><p>{detail}</p></div>
          </article>)}
        </div>
      </section>

      <section className="landing-how" aria-labelledby="how-it-works-title">
        <div className="landing-content">
          <SectionHeading id="how-it-works-title" title="How It Works" description="Get quality vehicle care in just a few simple steps." centered />
          <div className="landing-steps">
            {steps.map(({ title, detail, icon: Icon }, index) => <article className="landing-step" key={title}>
              <span className={`landing-step-number${index === 0 ? ' is-current' : ''}`}>{index + 1}</span>
              <Icon aria-hidden="true" className="landing-step-icon" />
              <h3>{title}</h3><p>{detail}</p>
              {index < steps.length - 1 && <ArrowRight className="landing-step-connector" aria-hidden="true" />}
            </article>)}
          </div>
        </div>
      </section>

      <section className="landing-services" id="services" aria-labelledby="services-title">
        <div className="landing-services-photo">
          <img src={serviceCenter} alt="Modern automotive service center exterior with a glass reception" loading="lazy" />
        </div>
        <div className="landing-services-copy">
          <SectionHeading id="services-title" eyebrow="OUR SERVICES" title={<>Comprehensive Care<br />for Your Toyota</>} description="From routine maintenance to diagnostic services, explore the options available in your account." />
          <div className="landing-service-grid" id="service-options">
            {serviceTypes.map(({ name, detail, icon: Icon }) => <article className="landing-service-card" key={name}>
              <span className="landing-service-icon"><Icon aria-hidden="true" /></span>
              <span className="landing-service-text"><h3>{name}</h3><p>{detail}</p></span>
              <ArrowRight className="landing-service-chevron" aria-hidden="true" />
            </article>)}
          </div>
          <a className="landing-button landing-button-primary landing-services-cta" href="#service-options">View All Services<ArrowRight aria-hidden="true" /></a>
        </div>
      </section>

      <section className="landing-about" id="about" aria-labelledby="about-title">
        <img src={maintenanceDetail} alt="Technician inspecting a vehicle engine in a professional workshop" loading="lazy" />
        <div className="landing-about-shade" aria-hidden="true" />
        <div className="landing-about-content">
          <SectionHeading id="about-title" eyebrow="WHY CHOOSE TOYOTA AUTOCARE" title={<>A Higher Standard<br />of Care</>} description="A clear, connected way to arrange vehicle service and keep track of each visit." />
          <ul className="landing-about-points">
            <li><Calendar aria-hidden="true" /><span>Book available appointments</span></li>
            <li><Settings aria-hidden="true" /><span>Follow service progress</span></li>
            <li><ShieldCheck aria-hidden="true" /><span>Review your service records</span></li>
          </ul>
        </div>
      </section>

      <section className="landing-experience" aria-labelledby="experience-title">
        <div className="landing-content">
          <SectionHeading id="experience-title" title="Your AutoCare Experience" description="Useful tools to stay connected to every service visit." centered />
          <div className="landing-experience-grid">
            {experience.map(({ title, detail, icon: Icon }) => <article className="landing-experience-card" key={title}>
              <Icon aria-hidden="true" /><h3>{title}</h3><p>{detail}</p>
            </article>)}
          </div>
        </div>
      </section>

      <section className="landing-faq" id="faqs" aria-labelledby="faq-title">
        <div className="landing-content landing-faq-layout">
          <div className="landing-faq-intro">
            <SectionHeading id="faq-title" title={<>Frequently Asked<br />Questions</>} description="Find answers about booking, service updates, and your account." />
            <a className="landing-button landing-button-outline" href="#faq-list">View FAQs<ArrowRight aria-hidden="true" /></a>
          </div>
          <div className="landing-faq-list" id="faq-list">
            {faqs.map(({ question, answer }, index) => {
              const expanded = expandedFaq === index
              const answerId = `landing-faq-answer-${index}`
              return <article className={`landing-faq-item${expanded ? ' is-expanded' : ''}`} key={question}>
                <h3><button type="button" aria-expanded={expanded} aria-controls={answerId} onClick={() => setExpandedFaq(expanded ? -1 : index)}>
                  <span>{question}</span><NavArrowDown aria-hidden="true" />
                </button></h3>
                <div id={answerId} className="landing-faq-answer" hidden={!expanded}><p>{answer}</p></div>
              </article>
            })}
          </div>
        </div>
      </section>

      <section className="landing-cta" aria-labelledby="landing-cta-title">
        <img src={vehicleCta} alt="Modern crossover shown from the rear quarter outside contemporary architecture" loading="lazy" />
        <div className="landing-cta-shade" aria-hidden="true" />
        <div className="landing-cta-content">
          <p className="landing-hero-eyebrow">READY TO GET STARTED?</p>
          <h2 id="landing-cta-title">Keep Your Toyota in Top Condition</h2>
          <p>Book your next service appointment and keep your vehicle running at its best.</p>
          <BookServiceLink className="landing-button landing-button-primary"><Calendar aria-hidden="true" />Book a Service<ArrowRight aria-hidden="true" /></BookServiceLink>
        </div>
      </section>
    </main>

    <footer className="landing-footer" id="contact">
      <div className="landing-content">
        <div className="landing-footer-main">
          <div className="landing-footer-brand">
            <Link className="landing-brand" to="/" aria-label="Toyota AutoCare home">
              <svg viewBox="0 0 64 40" aria-hidden="true"><ellipse cx="32" cy="20" rx="29" ry="17" /><ellipse cx="32" cy="20" rx="10" ry="17" /><ellipse cx="32" cy="13" rx="21" ry="8" /></svg>
              <span><b>Toyota</b> AutoCare</span>
            </Link>
            <p>Vehicle care, made simple. Manage bookings, service updates, and vehicle history in one place.</p>
          </div>
          <div className="landing-footer-column"><h2>Quick Links</h2><a href="#home">Home</a><a href="#services">Services</a><a href="#about">About</a><a href="#contact">Contact</a></div>
          <div className="landing-footer-column"><h2>Services</h2><a href="#service-options">Maintenance</a><a href="#service-options">Diagnostic</a><a href="#service-options">Browse service options</a></div>
          <div className="landing-footer-column"><h2>Support</h2><a href="#faqs">FAQs</a><button type="button" onClick={() => setPolicyOpen(true)}>Terms of Service</button><button type="button" onClick={() => setPolicyOpen(true)}>Privacy Policy</button><a href="#contact">Contact Us</a><Link to="/login">Sign In</Link></div>
        </div>
        <div className="landing-footer-bottom"><span>© 2026 Toyota AutoCare. All rights reserved.</span><span>Service information is available in your account.</span></div>
      </div>
    </footer>
    <PolicyDialog open={policyOpen} onClose={() => setPolicyOpen(false)} />
  </div>
}
