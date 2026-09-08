import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

/**
 * Gate for any route that requires a signed-in customer (currently just
 * `/account`). Deliberately does **not** check `profiles.role` — that's
 * `AdminRoute`'s job in Part 08B-2, not this component's.
 *
 * - While the initial session check is in flight: renders a minimal
 *   loading state instead of flashing a redirect.
 * - No authenticated user: redirects to `/login`, remembering the
 *   in-progress destination in router state so Login can send the user
 *   back where they were headed after a successful sign-in.
 * - Authenticated: renders the requested page.
 */
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="auth-route-loading" role="status" aria-live="polite">
        <p className="text-label">Loading…</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return children
}

export default ProtectedRoute
