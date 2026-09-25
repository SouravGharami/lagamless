import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

const DEBUG = typeof window !== 'undefined' && import.meta.env.DEV

function logDecision(reason, extra) {
  if (DEBUG) console.log('[lagamless auth] ProtectedRoute decision:', reason, extra ?? '')
}

/**
 * Gate for any route that requires a signed-in customer (currently just
 * `/account`). Deliberately does **not** check `profiles.role` — that's
 * `AdminRoute`'s job, not this component's.
 *
 * - Session check itself failed (network hiccup, tab waking from
 *   suspension): show a retry state, never redirect — a failed *check*
 *   is not the same as Supabase reporting "no session".
 * - While the initial session check is in flight: renders a minimal
 *   loading state instead of flashing a redirect.
 * - Session check succeeded and there's definitely no user: redirects to
 *   `/admin/login` (the password sign-in form — `/login` is now the
 *   customer-facing order-lookup page), remembering the in-progress
 *   destination in router state so Login can send the user back where
 *   they were headed after a successful sign-in.
 * - Authenticated: renders the requested page.
 */
function ProtectedRoute({ children }) {
  const { user, loading, sessionCheckError, retrySessionCheck } = useAuth()
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

  return children
}

export default ProtectedRoute
