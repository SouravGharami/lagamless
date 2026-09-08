import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

/**
 * Gate for the entire `/admin/*` tree.
 *
 * Unlike `ProtectedRoute` (signed-in customers only), this also checks
 * `profiles.role` via `useAuth().isAdmin` — a live read of the user's own
 * `profiles` row, never a client-side flag. The real authorization
 * boundary is Postgres RLS + `is_admin()` (see
 * `supabase/part-08b2a-admin-security.sql`); this component only decides
 * what the *UI* shows before the network even asks — a non-admin who
 * somehow rendered an admin page would still have every read/write
 * rejected by the database.
 *
 * States:
 * - Session or profile still loading: render a minimal loading state
 *   instead of flashing a redirect (mirrors `ProtectedRoute`).
 * - Not signed in: redirect to `/login`, remembering the in-progress
 *   destination in router state so Login can send the user back here
 *   after a successful sign-in (see `location.state?.from` in
 *   `Login.jsx`) — though Login only gets them back into `/admin/*` if
 *   they actually are an admin; otherwise this component redirects them
 *   again, to `/account`.
 * - Signed in, not an admin: redirect to `/account`. Deliberately does
 *   *not* redirect to `/login` — the person is genuinely authenticated,
 *   just not authorized for this area.
 * - Signed in and an admin: render the requested admin page.
 */
function AdminRoute({ children }) {
  const { user, loading, isAdmin, profileLoading } = useAuth()
  const location = useLocation()

  if (loading || profileLoading) {
    return (
      <div className="auth-route-loading" role="status" aria-live="polite">
        <p className="text-label">Loading…</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!isAdmin) {
    return <Navigate to="/account" replace />
  }

  return children
}

export default AdminRoute
