import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import './Navbar.css'

const NAV_LINKS = [
  { label: 'Shop', to: '/shop' },
  { label: 'Collections', to: '/shop' },
  { label: 'Our Story', to: '/about' },
  { label: 'Community', to: '/shop' },
]

/**
 * Site header — centered wordmark + tagline, primary nav on the left.
 * Sits directly under <TopBar />; sticky so it stays visible on scroll
 * while the announcement strip above it scrolls away.
 *
 * On the homepage, the bar starts fully transparent and overlaid on top
 * of the hero photograph (matching the reference design) with white
 * text, then crossfades to the solid white bar used on every other page
 * as soon as the person scrolls.
 */
function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { pathname } = useLocation()
  // The bar is a solid dark brand strip everywhere by default (see
  // Navbar.css) — the ONE exception is these full-bleed hero pages,
  // which start with the bar fully transparent and overlaid on the
  // hero photo, matching the reference design, then crossfade to the
  // same solid dark bar every other page uses as soon as the person
  // scrolls.
  const isOverlayPage = pathname === '/' || pathname === '/shop' || pathname === '/checkout'

  // The bar only switches to its "scrolled" look (solid background, shadow)
  // once it has actually reached the top of the viewport and locked into
  // its sticky position. Flipping the state any earlier — e.g. at a fixed
  // 8px — makes the switch happen while the bar is still travelling up
  // with the page, so it visibly snaps mid-motion and a sliver of empty
  // space from the TopBar shows above it. Measuring the TopBar's real
  // height keeps the two transitions in sync so the swap lands exactly
  // when the bar sticks, with no gap and no jump.
  useEffect(() => {
    const getThreshold = () => {
      const topbar = document.querySelector('.topbar')
      return topbar ? topbar.offsetHeight : 0
    }
    let threshold = getThreshold()
    const onScroll = () => setScrolled(window.scrollY >= threshold)
    const onResize = () => {
      threshold = getThreshold()
      onScroll()
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  const overlay = isOverlayPage && !scrolled && !menuOpen

  return (
    <header
      className={`navbar ${scrolled ? 'navbar--scrolled' : ''} ${overlay ? 'navbar--overlay' : ''}`}
    >
      <div className="container navbar__inner">
        <button
          className="navbar__icon-btn navbar__icon-btn--mobile-only"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          type="button"
        >
          {menuOpen ? <CloseIcon /> : <MenuIcon />}
        </button>

        <nav className="navbar__links navbar__links--desktop" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.label}
              to={link.to}
              className={({ isActive }) => 'navbar__link' + (isActive ? ' navbar__link--active' : '')}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <Link to="/" className="navbar__wordmark" onClick={() => setMenuOpen(false)}>
          <span className="navbar__wordmark-text">LAGAMLESS</span>
          <span className="navbar__wordmark-tagline">More than clothing. A culture.</span>
        </Link>

        <div className="navbar__spacer-right" aria-hidden="true" />
      </div>

      {menuOpen && (
        <nav className="navbar__mobile-panel" aria-label="Mobile">
          {NAV_LINKS.map((link, index) => (
            <NavLink
              key={link.label}
              to={link.to}
              className="navbar__mobile-link"
              onClick={() => setMenuOpen(false)}
            >
              <span className="navbar__mobile-index">{String(index + 1).padStart(2, '0')}</span>
              {link.label}
              <span className="navbar__mobile-arrow" aria-hidden="true">&rarr;</span>
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  )
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="3" y1="6" x2="17" y2="6" stroke="currentColor" strokeWidth="1.4" />
      <line x1="3" y1="14" x2="17" y2="14" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="4" y1="4" x2="16" y2="16" stroke="currentColor" strokeWidth="1.4" />
      <line x1="16" y1="4" x2="4" y2="16" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

export default Navbar
