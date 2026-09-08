import { useState } from 'react'
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom'
import ConfirmDialog from './components/ConfirmDialog.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import './Admin.css'

const NAV_ITEMS = [
  { label: 'Dashboard', to: '/admin/dashboard' },
  { label: 'Products', to: '/admin/products' },
  { label: 'Add product', to: '/admin/products/new' },
  { label: 'Inventory', to: '/admin/inventory' },
  { label: 'Orders', to: '/admin/orders' },
  { label: 'Customers', to: '/admin/customers' },
  { label: 'Settings', to: '/admin/settings' },
]

/**
 * The admin shell. As of Part 08B-2A this entire tree is gated by
 * `AdminRoute` (see `App.jsx`) — only a signed-in user whose `profiles`
 * row has `role = 'admin'` ever reaches this component.
 */
function AdminLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const navigate = useNavigate()
  const { signOut } = useAuth()

  async function handleLogout() {
    setLogoutOpen(false)
    await signOut()
    navigate('/')
  }

  return (
    <div className="admin">
      <header className="admin__mobile-header">
        <button
          type="button"
          className="admin__menu-btn"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open admin menu"
          aria-expanded={drawerOpen}
        >
          ☰
        </button>
        <Link to="/admin/dashboard" className="admin__wordmark admin__wordmark--mobile">
          LAGAMLESS <span className="admin__badge">Admin</span>
        </Link>
      </header>

      <aside className="admin__sidebar">
        <Link to="/admin/dashboard" className="admin__wordmark">
          LAGAMLESS
          <span className="admin__badge">Admin</span>
        </Link>
        <nav className="admin__nav" aria-label="Admin">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/admin/products'}
              className={({ isActive }) =>
                'admin__nav-link' + (isActive ? ' admin__nav-link--active' : '')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="admin__sidebar-footer">
          <Link to="/" className="admin__nav-link">
            View store
          </Link>
          <button type="button" className="admin__nav-link admin__logout-btn" onClick={() => setLogoutOpen(true)}>
            Log out
          </button>
        </div>
      </aside>

      {drawerOpen && (
        <div className="admin__drawer-backdrop" onClick={() => setDrawerOpen(false)}>
          <nav
            className="admin__drawer"
            aria-label="Admin"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="admin__drawer-close"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close admin menu"
            >
              ✕
            </button>
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/admin/products'}
                onClick={() => setDrawerOpen(false)}
                className={({ isActive }) =>
                  'admin__drawer-link' + (isActive ? ' admin__drawer-link--active' : '')
                }
              >
                {item.label}
              </NavLink>
            ))}
            <div className="admin__drawer-footer">
              <Link to="/" className="admin__drawer-link" onClick={() => setDrawerOpen(false)}>
                View store
              </Link>
              <button
                type="button"
                className="admin__drawer-link admin__logout-btn"
                onClick={() => {
                  setDrawerOpen(false)
                  setLogoutOpen(true)
                }}
              >
                Log out
              </button>
            </div>
          </nav>
        </div>
      )}

      <main className="admin__content">
        <Outlet />
      </main>

      <ConfirmDialog
        open={logoutOpen}
        title="Log out?"
        description="You'll need to sign back in with an admin account to return to this panel."
        confirmLabel="Log out"
        onConfirm={handleLogout}
        onCancel={() => setLogoutOpen(false)}
      />
    </div>
  )
}

export default AdminLayout
