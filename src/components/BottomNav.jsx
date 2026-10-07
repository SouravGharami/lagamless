import { NavLink, useLocation } from 'react-router-dom'
import { useCart } from '../context/CartContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useWishlist } from '../context/WishlistContext.jsx'
import './BottomNav.css'

/**
 * Fixed bottom tab bar — mobile only (hidden at the same >=768px breakpoint
 * everywhere else switches to "desktop", see BottomNav.css). This is the
 * single biggest lever for making the site feel like a native app instead
 * of a shrunk website: primary destinations always one thumb-tap away,
 * pinned to the safe area, instead of buried behind a hamburger menu or a
 * thin icon strip at the very top of the screen.
 *
 * Search doesn't navigate — it opens the full-screen <MobileSearchOverlay />
 * (owned by SiteLayout) so search feels instant, the way an app's search
 * tab does, rather than a page transition.
 *
 * @param {{ onSearchClick: () => void }} props
 */
function BottomNav({ onSearchClick }) {
  const { totalItems } = useCart()
  const { user } = useAuth()
  const { count: wishlistCount } = useWishlist()
  const { pathname } = useLocation()
  const isShopActive = pathname === '/shop'

  // Hidden on the product page (its own fixed <StickyBuyBar /> owns that
  // screen edge — two fixed bars stacked on the same edge would collide)
  // and during checkout, where an app keeps focus on completing payment
  // instead of offering a way to tab away from it.
  const hidden = pathname.startsWith('/product/') || pathname === '/checkout'
  if (hidden) return null

  return (
    <nav className="bottom-nav" aria-label="Primary">
      <NavLink
        to="/"
        end
        className={({ isActive }) => 'bottom-nav__item' + (isActive ? ' bottom-nav__item--active' : '')}
      >
        <HomeIcon />
        <span>Home</span>
      </NavLink>

      <NavLink
        to="/shop"
        className={'bottom-nav__item' + (isShopActive ? ' bottom-nav__item--active' : '')}
      >
        <ShopIcon />
        <span>Shop</span>
      </NavLink>

      <button
        type="button"
        className="bottom-nav__item bottom-nav__item--search"
        onClick={onSearchClick}
        aria-label="Search products"
      >
        <span className="bottom-nav__search-badge">
          <SearchIcon />
        </span>
        <span>Search</span>
      </button>

      <NavLink to="/wishlist" className={({ isActive }) => 'bottom-nav__item' + (isActive ? ' bottom-nav__item--active' : '')}>
        <span className="bottom-nav__icon-wrap">
          <HeartIcon />
          {wishlistCount > 0 && (
            <span className="bottom-nav__badge">{wishlistCount > 99 ? '99+' : wishlistCount}</span>
          )}
        </span>
        <span>Saved</span>
      </NavLink>

      <NavLink to="/cart" className={({ isActive }) => 'bottom-nav__item' + (isActive ? ' bottom-nav__item--active' : '')}>
        <span className="bottom-nav__icon-wrap">
          <CartIcon />
          {totalItems > 0 && (
            <span className="bottom-nav__badge">{totalItems > 99 ? '99+' : totalItems}</span>
          )}
        </span>
        <span>Cart</span>
      </NavLink>

      <NavLink
        to={user ? '/account' : '/login'}
        className={({ isActive }) => 'bottom-nav__item' + (isActive ? ' bottom-nav__item--active' : '')}
      >
        <AccountIcon />
        <span>{user ? 'Account' : 'Sign in'}</span>
      </NavLink>
    </nav>
  )
}

function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M3.5 10.2L11 4l7.5 6.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 9v8h11V9" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 17v-4.5h4V17" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function ShopIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M4 7h14l-1.2 11.2a1.2 1.2 0 01-1.2 1.1H6.4a1.2 1.2 0 01-1.2-1.1L4 7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 7V5.8a3 3 0 016 0V7" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 19 19" fill="none" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="6.2" stroke="currentColor" strokeWidth="1.6" />
      <line x1="13.2" y1="13.2" x2="17.5" y2="17.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function HeartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M11 18.6S3.4 14 3.4 8.5A4 4 0 0111 6.3a4 4 0 017.6 2.2c0 5.5-7.6 10.1-7.6 10.1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function CartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M3.7 6h14.6l-1.2 11.4a1.2 1.2 0 01-1.2 1.1H6.1a1.2 1.2 0 01-1.2-1.1L3.7 6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7.8 6V4.8a3.2 3.2 0 016.4 0V6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function AccountIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <circle cx="11" cy="7.3" r="3.6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 19c1.2-3.9 4.6-6 7.5-6s6.3 2.1 7.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export default BottomNav
