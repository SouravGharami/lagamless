import { useEffect, useState } from 'react'
import Container from '../components/Container.jsx'
import { MailIcon, ShieldIcon, PulseIcon, ReturnIcon, SwapIcon, TrackHeroArt } from '../components/TrackIcons.jsx'
import Button from '../components/Button.jsx'
import OrderHistory from '../components/OrderHistory.jsx'
import { validateEmail } from '../lib/authValidation.js'
import { getOrdersByEmail } from '../services/checkout.js'
import { useAuth } from '../context/AuthContext.jsx'
import './Auth.css'
import './OrderStatus.css'
import './OrderLookup.css'
import './TrackTheme.css'

/**
 * Customer-facing default at /login — no password. Checkout is guest by
 * default (see services/checkout.js), so the only thing most shoppers
 * have on file is the email they typed at checkout; this trades a
 * password for that email to show past/current orders. See
 * supabase/functions/get-orders-by-email for the security trade-off this
 * makes.
 *
 * The password-based account sign-in (staff/admin, or anyone who *did*
 * create a password account via /signup) has moved to /admin/login — see
 * App.jsx — so it never shows here.
 */
function OrderLookup() {
  const { isSupabaseConfigured } = useAuth()

  const [email, setEmail] = useState('')
  const [touched, setTouched] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [orders, setOrders] = useState(null)
  const [searchedEmail, setSearchedEmail] = useState(null)

  const emailError = validateEmail(email)
  const showEmailError = (touched || submitAttempted) && emailError

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitAttempted(true)
    setError(null)
    if (emailError || loading) return

    setLoading(true)
    try {
      const data = await getOrdersByEmail(email.trim())
      setOrders(data.orders)
      setSearchedEmail(email.trim())
    } catch (err) {
      setOrders(null)
      setError(err.message || 'Something went wrong looking up your orders. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Re-reads this customer's orders/returns from Supabase (the same
   * get-orders-by-email call handleSubmit already uses) right after a
   * return request is submitted, so the item it was submitted for shows
   * as "Return Request Initiated" — and the Return button/picker for it
   * disappears — immediately, without the customer re-entering their
   * email. Best-effort: a failure here just means the list stays as it
   * was until the next successful lookup; the return itself already went
   * through (see ReturnRequestDialog's onSubmitted call).
   */
  async function refreshOrders() {
    if (!searchedEmail) return
    try {
      const data = await getOrdersByEmail(searchedEmail)
      setOrders(data.orders)
    } catch {
      // Silent — see note above.
    }
  }

  // Keep the page truthful without the customer re-typing their email: when
  // they come back to this tab (e.g. after the courier's call, or after the
  // store marks their payment received) re-read their orders. Best-effort and
  // silent — see refreshOrders().
  useEffect(() => {
    if (!searchedEmail) return
    function onVisible() {
      if (document.visibilityState === 'visible') refreshOrders()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchedEmail])

  const [refreshing, setRefreshing] = useState(false)
  async function handleManualRefresh() {
    setRefreshing(true)
    await refreshOrders()
    setRefreshing(false)
  }

  return (
    <div className="tk tk-page">
      <div className="tk-page__glow" aria-hidden="true" />
      <div className="tk-page__grid" aria-hidden="true" />
      <Container>
        <div className="tk-hero">
          <div className="tk-hero__copy">
            <p className="tk-eyebrow">
              <span className="tk-eyebrow__dot" /> Live order tracking
            </p>
            <h1 className="tk-hero__title">
              Track your <span>order.</span>
            </h1>
            <p className="tk-hero__lead">
              Enter the email you used at checkout to see everything you've ordered — past and current — plus returns
              and replacements, all in one place.
            </p>
            <ul className="tk-hero__chips">
              <li className="tk-chip"><PulseIcon /> Real-time status</li>
              <li className="tk-chip"><ReturnIcon /> 7-day easy returns</li>
              <li className="tk-chip"><SwapIcon /> Size replacements</li>
            </ul>

            <div className="tk-lookup">
              {!isSupabaseConfigured && (
                <p className="auth-form-error" role="alert">
                  Order lookup isn't available yet — this project has not been connected to Supabase.
                </p>
              )}

              <form className="auth-form" onSubmit={handleSubmit} noValidate>
                <div className="auth-field">
                  <label className="text-label" htmlFor="lookup-email">
                    Email
                  </label>
                  <div className="tk-input">
                    <MailIcon />
                    <input
                      id="lookup-email"
                      name="email"
                      className="input"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() => setTouched(true)}
                      aria-invalid={Boolean(showEmailError)}
                      aria-describedby={showEmailError ? 'lookup-email-error' : undefined}
                      required
                    />
                  </div>
                  {showEmailError && (
                    <p id="lookup-email-error" className="auth-field__error" role="alert">
                      {emailError}
                    </p>
                  )}
                </div>

                {error && (
                  <p className="auth-form-error" role="alert">
                    {error}
                  </p>
                )}

                <Button type="submit" variant="primary" block disabled={loading}>
                  {loading ? 'Looking up your orders…' : 'View my orders →'}
                </Button>
              </form>
              <p className="tk-lookup__note">
                <ShieldIcon width={15} height={15} /> No password needed. We only show orders placed with this email.
              </p>
            </div>
          </div>

          <div className="tk-hero__art" aria-hidden="true">
            <TrackHeroArt />
          </div>
        </div>

        {orders && (
          <div className="order-lookup-results">
            {orders.length === 0 ? (
              <p className="account-orders-empty">
                We couldn't find any orders for <strong>{searchedEmail}</strong>. Double-check the email you used
                at checkout.
              </p>
            ) : (
              <>
                <div className="order-lookup-refresh">
                  <p className="text-label">
                    {orders.length} {orders.length === 1 ? 'order' : 'orders'} for {searchedEmail}
                  </p>
                  <Button type="button" variant="secondary" onClick={handleManualRefresh} disabled={refreshing}>
                    {refreshing ? 'Refreshing…' : 'Refresh status'}
                  </Button>
                </div>
                <OrderHistory orders={orders} customerEmail={searchedEmail} onRefresh={refreshOrders} />
              </>
            )}
          </div>
        )}
      </Container>
    </div>
  )
}

export default OrderLookup
