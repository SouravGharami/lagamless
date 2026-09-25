import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Container from '../components/Container.jsx'
import Section from '../components/Section.jsx'
import Button from '../components/Button.jsx'
import OrderHistory from '../components/OrderHistory.jsx'
import { getOrdersByEmail } from '../services/checkout.js'
import { useAuth } from '../context/AuthContext.jsx'
import './Auth.css'

/**
 * Customer account page: identity, logout, and order history. Order history
 * uses the same get-orders-by-email lookup (and the same OrderHistory cards)
 * as the "Track your order" page, keyed on the signed-in user's email — so
 * guest orders placed with that email show up here too, including Cash on
 * Delivery orders with the amount due on delivery.
 *
 * Profile/admin state is owned entirely by AuthContext (see
 * src/context/AuthContext.jsx) — this page does not run its own
 * `profiles` query. That used to be a real bug: a duplicate fetch here
 * meant a failed `profiles` SELECT silently rendered "Account type:
 * customer" for anyone, including an actual admin, instead of surfacing
 * the error or falling back to the authoritative `is_admin()` check.
 */
function Account() {
  const { user, profile, profileLoading, profileError, isAdmin, adminCheckError, refreshProfile, signOut } = useAuth()
  const navigate = useNavigate()

  const [signingOut, setSigningOut] = useState(false)
  const [retrying, setRetrying] = useState(false)

  const [orders, setOrders] = useState(null) // null = loading
  const [ordersError, setOrdersError] = useState(null)
  const email = user?.email

  // Used by "Retry" and after a return is submitted.
  const loadOrders = useCallback(() => {
    if (!email) return Promise.resolve()
    return getOrdersByEmail(email)
      .then((data) => {
        setOrders(data.orders)
        setOrdersError(null)
      })
      .catch((err) => {
        setOrdersError(err.message || "We couldn't load your orders right now.")
        setOrders((prev) => prev ?? [])
      })
  }, [email])

  useEffect(() => {
    let cancelled = false
    if (!email) return undefined
    getOrdersByEmail(email)
      .then((data) => {
        if (!cancelled) {
          setOrders(data.orders)
          setOrdersError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setOrdersError(err.message || "We couldn't load your orders right now.")
          setOrders((prev) => prev ?? [])
        }
      })
    return () => {
      cancelled = true
    }
  }, [email])

  async function handleLogout() {
    setSigningOut(true)
    try {
      await signOut()
      navigate('/', { replace: true })
    } finally {
      setSigningOut(false)
    }
  }

  async function handleRetryProfile() {
    setRetrying(true)
    try {
      await refreshProfile()
    } finally {
      setRetrying(false)
    }
  }

  const displayName = profile?.full_name || user?.user_metadata?.full_name || null

  // `isAdmin` (from the `is_admin()` RPC) is authoritative and checked
  // first, so a real admin is never shown as "customer" just because the
  // separate `profiles` SELECT had a problem. `isAdmin` is tri-state
  // (null = not yet confirmed, true/false = confirmed) — only fall
  // through to a profile-fetch/admin-check error state — never to a bare
  // "customer" guess — when a request actually failed.
  let roleLabel = null
  if (!profileLoading) {
    if (isAdmin === true) roleLabel = 'admin'
    else if (profileError || adminCheckError) roleLabel = null // rendered as an error state below instead
    else roleLabel = profile?.role ?? 'customer'
  }

  return (
    <Section>
      <Container>
        <p className="text-label">Account</p>
        <h1 className="text-h1" style={{ marginTop: '1rem' }}>
          {displayName ? `Hi, ${displayName.split(' ')[0]}` : 'Your account'}
        </h1>

        <div className="account-layout">
          <div className="account-card">
            <dl style={{ margin: 0 }}>
              <div className="account-row">
                <dt>Name</dt>
                <dd>{profileLoading ? '—' : displayName || 'Not set'}</dd>
              </div>
              <div className="account-row">
                <dt>Email</dt>
                <dd>{user?.email}</dd>
              </div>
              <div className="account-row">
                <dt>Account type</dt>
                <dd>
                  {profileLoading ? (
                    <span className="account-role-badge">—</span>
                  ) : roleLabel ? (
                    <span className="account-role-badge">{roleLabel}</span>
                  ) : (
                    <span className="account-role-error">
                      Couldn't verify account type.{' '}
                      <button type="button" className="account-role-retry" onClick={handleRetryProfile} disabled={retrying}>
                        {retrying ? 'Retrying…' : 'Retry'}
                      </button>
                    </span>
                  )}
                </dd>
              </div>
            </dl>

            {!profileLoading && isAdmin && (
              <p style={{ marginTop: '0.5rem' }}>
                <Link to="/admin" className="link-underline">
                  Go to admin dashboard →
                </Link>
              </p>
            )}

            <Button variant="secondary" onClick={handleLogout} disabled={signingOut}>
              {signingOut ? 'Signing out…' : 'Log out'}
            </Button>
          </div>

          <div className="account-card">
            <h2 className="text-h3">Order history</h2>
            {orders === null ? (
              <p className="account-orders-empty">Loading your orders…</p>
            ) : (
              <>
                {ordersError && (
                  <p className="account-role-error" role="alert">
                    {ordersError}{' '}
                    <button type="button" className="account-role-retry" onClick={loadOrders}>
                      Retry
                    </button>
                  </p>
                )}
                {orders.length === 0 && !ordersError ? (
                  <p className="account-orders-empty">
                    You haven't placed any orders yet. Once you do, they'll appear here.
                  </p>
                ) : (
                  <OrderHistory orders={orders} customerEmail={email} onRefresh={loadOrders} />
                )}
              </>
            )}
          </div>
        </div>
      </Container>
    </Section>
  )
}

export default Account
