import { Link } from 'react-router-dom'
import { useCart } from '../context/CartContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import './TopBar.css'

/**
 * Slim black announcement strip above the main navbar — shipping / COD /
 * returns USPs on the left, country selector and the icon cluster
 * (search, account, wishlist, cart) on the right. Scrolls away with the
 * page; the main <Navbar /> underneath stays sticky.
 */
function TopBar() {
  const { totalItems } = useCart()
  const { user } = useAuth()

  return (
    <div className="topbar">
      <div className="container topbar__inner">
        <ul className="topbar__usps">
          <li>Free shipping on orders above ₹999</li>
          <li className="topbar__divider" aria-hidden="true" />
          <li>COD available</li>
          <li className="topbar__divider" aria-hidden="true" />
          <li>Easy returns</li>
        </ul>

        <div className="topbar__right">
          <button type="button" className="topbar__country">
            <span className="topbar__flag" aria-hidden="true">🇮🇳</span>
            India
            <ChevronIcon />
          </button>

          <div className="topbar__icons">
            <button className="topbar__icon-btn" aria-label="Search" type="button">
              <SearchIcon />
            </button>
            <Link
              to={user ? '/account' : '/login'}
              className="topbar__icon-btn"
              aria-label={user ? 'Account' : 'Sign in'}
            >
              <AccountIcon />
            </Link>
            <Link to="/account" className="topbar__icon-btn" aria-label="Wishlist">
              <HeartIcon />
            </Link>
            <Link to="/cart" className="topbar__icon-btn topbar__icon-btn--cart" aria-label="Cart">
              <CartIcon />
              <span className="topbar__cart-count">{totalItems > 99 ? '99+' : totalItems}</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function ChevronIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <line x1="12.5" y1="12.5" x2="17" y2="17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function AccountIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="9" cy="6" r="3" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.5 16c1-3.2 3.8-5 6.5-5s5.5 1.8 6.5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function HeartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M9 15.5S2.5 11.6 2.5 6.9A3.4 3.4 0 019 5a3.4 3.4 0 016.5 1.9c0 4.7-6.5 8.6-6.5 8.6z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 5h12l-1 9.5a1 1 0 01-1 .9H5a1 1 0 01-1-.9L3 5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6.5 5V4a2.5 2.5 0 015 0v1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

export default TopBar
