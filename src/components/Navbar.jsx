import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import './Navbar.css'

const NAV_LINKS = [
  { label: 'Shop', to: '/shop' },
  { label: 'About', to: '/about' },
]

function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { totalItems } = useCart()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    setMenuOpen(false)
    await signOut()
    navigate('/')
  }

  return (
    <header className="navbar">
      <div className="container navbar__inner">
        <Link to="/" className="navbar__wordmark" onClick={() => setMenuOpen(false)}>
          LAGAMLESS
        </Link>

        <nav className="navbar__links navbar__links--desktop" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                'navbar__link link-underline' + (isActive ? ' navbar__link--active' : '')
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="navbar__actions">
          <button className="navbar__icon-btn" aria-label="Search" type="button">
            <SearchIcon />
          </button>
          <Link
            to={user ? '/account' : '/login'}
            className="navbar__icon-btn navbar__icon-btn--desktop"
            aria-label={user ? 'Account' : 'Sign in'}
          >
            <AccountIcon />
          </Link>
          <Link
            to="/cart"
            className="navbar__icon-btn navbar__icon-btn--cart"
            aria-label={`Cart${totalItems > 0 ? `, ${totalItems} item${totalItems === 1 ? '' : 's'}` : ''}`}
          >
            <CartIcon />
            {totalItems > 0 && <span className="navbar__cart-count">{totalItems > 99 ? '99+' : totalItems}</span>}
          </Link>
          <button
            className="navbar__icon-btn navbar__icon-btn--mobile-only"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            type="button"
          >
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="navbar__mobile-panel" aria-label="Mobile">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className="navbar__mobile-link"
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </NavLink>
          ))}
          <NavLink
            to={user ? '/account' : '/login'}
            className="navbar__mobile-link"
            onClick={() => setMenuOpen(false)}
          >
            {user ? 'Account' : 'Sign in'}
          </NavLink>
          {user && (
            <button type="button" className="navbar__mobile-link navbar__mobile-link--button" onClick={handleLogout}>
              Log out
            </button>
          )}
        </nav>
      )}
    </header>
  )
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <line x1="12.5" y1="12.5" x2="17" y2="17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function AccountIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="9" cy="6" r="3" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.5 16c1-3.2 3.8-5 6.5-5s5.5 1.8 6.5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function CartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 5h12l-1 9.5a1 1 0 01-1 .9H5a1 1 0 01-1-.9L3 5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6.5 5V4a2.5 2.5 0 015 0v1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
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
