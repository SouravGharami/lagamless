import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

const DEBUG = typeof window !== 'undefined' && import.meta.env.DEV

function logDecision(reason, extra) {
  if (DEBUG) console.log('[lagamless auth] AdminRoute decision:', reason, extra ?? '')
}

/**
 * Gate for the entire `/admin/*` tree.
 *
 * Unlike `ProtectedRoute` (signed-in customers only), this also checks
 * `useAuth().isAdmin` — a live, **tri-state** result of the
 * `public.is_admin()` SECURITY DEFINER function (see
 * `supabase/part-08b2a-admin-security.sql`): `null` (not yet confirmed
 * either way), `true` (confirmed admin), or `false` (confirmed not
 * admin). Never a client-side flag, never solely derived from the
 * separate `profiles` row fetch (which can fail independently — see
 * `AuthContext.jsx`). The real authorization boundary is Postgres RLS +
 * `is_admin()`; this component only decides what the *UI* shows before
 * the network even asks — a non-admin who somehow rendered an admin page
 * would still have every read/write rejected by the database.
 *
 * States, checked in this order:
 * 1. Session check itself failed (network hiccup, tab waking from
 *    suspension) → retry state. Never redirect — a failed *check* is not
 *    the same as Supabase reporting "no session".
 * 2. Session still restoring, or admin status still `null` (not yet
 *    confirmed either way) → loading state. `isAdmin === null` is
 *    "unknown", never treated as "not admin".
 * 3. Session check succeeded and there's definitely no user → redirect
 *    to `/admin/login` (the password sign-in — `/login` is the
 *    customer-facing order-lookup page, not a sign-in form), remembering
 *    the in-progress destination in router state so Login can send the
 *    user back here after a successful sign-in.
 * 4. Signed in, but the last `is_admin()` RPC attempt itself failed and
 *    admin status has never been confirmed → retry state, not a guess
 *    either way.
 * 5. Signed in, `isAdmin === false` (RPC actually ran and confirmed
 *    "not admin") → redirect to `/account`. Deliberately not `/login` —
 *    the person is genuinely authenticated, just not authorized here.
 * 6. Signed in, `isAdmin === true` → render the requested admin page.
 */
function AdminRoute({ children }) {
  const {
    user,
    loading,
    isAdmin,
    profileLoading,
    sessionCheckError,
    adminCheckError,
    retrySessionCheck,
    refreshProfile,
  } = useAuth()
  const location = useLocation()

  if (sessionCheckError) {
    logDecision('showing retry — session check failed', sessionCheckError)
    return (
      <div className="auth-route-loading" role="alert" aria-live="assertive">
        <p className="text-label">Couldn't verify your session. Check your connection and try again.</p>
        <button type="button" className="btn-ghost" onClick={retrySessionCheck}>
          Retry
        </button>
      </div>
    )
  }

  if (loading) {
    logDecision('loading — session still restoring')
    return (
      <div className="auth-route-loading" role="status" aria-live="polite">
        <p className="text-label">Loading…</p>
      </div>
    )
  }

  if (!user) {
    logDecision('redirect → /admin/login', { from: location.pathname })
    return <Navigate to="/admin/login" state={{ from: location }} replace />
  }

  // `isAdmin === null` covers both "still checking" (profileLoading true)
  // and "the last check failed and nothing has ever been confirmed"
  // (adminCheckError set, profileLoading false) — neither may ever be
  // treated as "not admin".
  if (isAdmin === null) {
    if (adminCheckError && !profileLoading) {
      logDecision('showing retry — admin check failed, never confirmed', adminCheckError)
      return (
        <div className="auth-route-loading" role="alert" aria-live="assertive">
          <p className="text-label">Couldn't verify admin access. Check your connection and try again.</p>
          <button type="button" className="btn-ghost" onClick={refreshProfile}>
            Retry
          </button>
        </div>
      )
    }
    logDecision('loading — admin status not yet confirmed')
    return (
      <div className="auth-route-loading" role="status" aria-live="polite">
        <p className="text-label">Checking admin access…</p>
      </div>
    )
  }

  if (isAdmin === false) {
    logDecision('redirect → /account (confirmed not admin)', { userId: user.id })
    return <Navigate to="/account" replace />
  }

  return children
}

export default AdminRoute
