import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabase.js'
import * as authService from '../services/auth.js'
import { checkIsAdmin, getMyProfile } from '../services/profiles.js'

/**
 * Auth context — centralized Supabase Auth state for the whole app
 * (Navbar, ProtectedRoute, AdminRoute, Login, Signup, Account,
 * ForgotPassword, ResetPassword).
 *
 * ============================================================================
 * STATE MACHINE (read this before touching anything below)
 * ============================================================================
 *
 * `loading`        — true until the very first "is there a session at all"
 *                     check resolves (restored from storage, or definitely
 *                     none). Nothing downstream may redirect while this is
 *                     true.
 * `sessionCheckError` — non-null only when that check itself repeatedly
 *                     FAILED to complete (network/etc). This is NOT "signed
 *                     out" — it's "we don't know yet". Never redirect to
 *                     /login because of this; show a retry state instead.
 * `user`/`session` — null means Supabase Auth has definitively reported no
 *                     authenticated user (a real SIGNED_OUT, or the initial
 *                     check completing with no session). This is the ONLY
 *                     signal `ProtectedRoute`/`AdminRoute` may treat as
 *                     "redirect to /login".
 * `profileLoading` — true while the `profiles` row + `is_admin()` RPC are
 *                     being (re-)verified for the current user.
 * `isAdmin`        — **tri-state**, not boolean:
 *                       null  = not yet confirmed either way (checking, or
 *                               the last check failed) — treat as "keep
 *                               showing a loading/checking state", NEVER as
 *                               "not admin".
 *                       true  = confirmed admin, straight from the
 *                               `is_admin()` RPC.
 *                       false = confirmed NOT an admin — the RPC actually
 *                               ran and returned false. Only this value may
 *                               ever redirect an authenticated user away
 *                               from /admin.
 * `adminCheckError`/`profileError` — set when the respective request
 *                     failed. A failure NEVER forces `isAdmin`/`profile`
 *                     back down to a "not admin"/"no profile" value; it only
 *                     ever leaves the last known-good value in place (or
 *                     `null`, if there was never a known-good value yet) and
 *                     surfaces the error for a retry UI.
 *
 * ============================================================================
 * WHY THIS FILE LOOKS THE WAY IT DOES (the actual tab-switch bug)
 * ============================================================================
 *
 * Root cause of "switching tabs redirects an admin to /account": Supabase's
 * `onAuthStateChange` fires `TOKEN_REFRESHED` — with a brand-new `session`
 * object (new `access_token`, new `session.user` object reference) — both
 * periodically AND specifically when a hidden tab regains visibility
 * (Supabase's own internal auto-refresh proactively refreshes a
 * close-to-expiry token on focus). The *previous* version of this file kept
 * an effect that re-ran `loadProfileAndAdminStatus` any time the `user`
 * *object* changed — which TOKEN_REFRESHED does on every single occurrence,
 * even though it's the exact same signed-in person. That re-triggered a
 * fresh `profiles` SELECT + `is_admin()` RPC call on basically every tab
 * focus. If that re-check ever raced the token swap (or hit any transient
 * hiccup) and came back with a legitimate-looking "not an admin" response
 * for that one request, it overwrote a previously-confirmed `isAdmin: true`
 * with `false` — and `AdminRoute` immediately, correctly (per its own
 * logic) navigated an admin who never signed out to `/account`.
 *
 * The fix has two parts, both below:
 *   1. Only re-verify profile/admin status when *which user* actually
 *      changes — keyed off `user?.id` (a stable primitive), not the `user`
 *      object reference, so a same-user TOKEN_REFRESHED never triggers a
 *      redundant re-verification at all.
 *   2. Make `isAdmin` tri-state so that even if a re-verification *is*
 *      ever needed and it fails, "unknown" is never conflated with
 *      "confirmed not admin".
 */

const AuthContext = createContext(null)

const DEBUG = typeof window !== 'undefined' && import.meta.env.DEV

function authLog(...args) {
  if (DEBUG) console.log('[lagamless auth]', ...args)
}

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)

  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)

  // Tri-state — see the file header. Starts `null` ("not checked yet"),
  // never `false`, so nothing ever renders "confirmed not admin" before a
  // real check has actually happened.
  const [isAdmin, setIsAdmin] = useState(null)
  const [adminCheckError, setAdminCheckError] = useState(null)

  const [sessionCheckError, setSessionCheckError] = useState(null)

  // Guards against a stale response from an earlier fetch overwriting a
  // newer one — e.g. sign-out immediately followed by sign-in as a
  // different user, or React StrictMode's dev-only double-invoke of
  // effects. Each fetch checks it still "owns" the latest request before
  // committing state.
  const profileRequestId = useRef(0)

  // Bumped to force the session-restore effect below to run again — the
  // only way `retrySessionCheck` (exposed to the UI) can ask for another
  // attempt after all automatic retries have been exhausted.
  const [sessionCheckAttempt, setSessionCheckAttempt] = useState(0)

  useEffect(() => {
    let active = true
    // Set the moment a *real* auth event arrives (SIGNED_IN, SIGNED_OUT,
    // TOKEN_REFRESHED, INITIAL_SESSION, ...). Once one has fired, it is
    // always more current than whatever this render's `getSession()` call
    // is about to resolve with — prevents a late, stale `getSession()`
    // result from overwriting a newer session delivered by the listener.
    let authEventFired = false
    let retryTimeoutId = null

    if (!isSupabaseConfigured) {
      setLoading(false)
      return undefined
    }

    // Restores the session on mount, retrying a few times with backoff on
    // failure instead of ever treating "the check failed" the same as
    // "there is no session". A genuinely signed-out user still resolves
    // cleanly here — `getSession()` only throws when the check itself
    // couldn't be completed, e.g. a transient network error right as the
    // tab wakes from suspension.
    async function checkSession(attempt) {
      try {
        const restoredSession = await authService.getSession()
        if (!active || authEventFired) return
        authLog('initial session check resolved', {
          attempt,
          hasSession: Boolean(restoredSession),
          userId: restoredSession?.user?.id ?? null,
        })
        setSession(restoredSession)
        setUser(restoredSession?.user ?? null)
        setSessionCheckError(null)
        setLoading(false)
      } catch (err) {
        if (!active || authEventFired) return
        console.warn(`[lagamless auth] session check failed (attempt ${attempt}).`, err)
        if (attempt < 3) {
          retryTimeoutId = setTimeout(() => checkSession(attempt + 1), attempt * 1000)
          return
        }
        // Out of automatic retries. Do NOT clear `session`/`user` — if a
        // session was already known-good from a prior render it stays
        // exactly as it was; if this is the very first check, both are
        // still their initial `null`, which correctly renders as "signed
        // out" only until `retrySessionCheck()` (or a real auth event)
        // resolves it definitively.
        setSessionCheckError(err)
        setLoading(false)
      }
    }

    checkSession(1)

    // Fires on SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED,
    // INITIAL_SESSION, and PASSWORD_RECOVERY — this single listener is
    // what keeps the Navbar, ProtectedRoute, and Account page in sync with
    // zero manual wiring. This is also the *only* place `user`/`session`
    // are ever cleared to null in response to a "signed out" signal —
    // never a failed request elsewhere in the app.
    const unsubscribe = authService.onAuthStateChange((event, nextSession) => {
      if (!active) return
      authEventFired = true
      if (retryTimeoutId) clearTimeout(retryTimeoutId)
      authLog('onAuthStateChange', {
        event,
        hasSession: Boolean(nextSession),
        userId: nextSession?.user?.id ?? null,
      })
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      setSessionCheckError(null)
      setLoading(false)
    })

    return () => {
      active = false
      if (retryTimeoutId) clearTimeout(retryTimeoutId)
      unsubscribe()
    }
  }, [sessionCheckAttempt])

  // Manual retry after automatic retries were exhausted — e.g. a "Retry"
  // button shown alongside `sessionCheckError`.
  const retrySessionCheck = useCallback(() => {
    setSessionCheckError(null)
    setSessionCheckAttempt((n) => n + 1)
  }, [])

  // When the tab wakes from being hidden/suspended, defensively reconcile
  // the live session — but this is read-only and additive. It never
  // triggers a profile/admin re-verification by itself (see the `user?.id`
  // keyed effect below): if the underlying user hasn't actually changed,
  // there is nothing here for it to do except keep `session`'s token
  // fresh. A transient failure here is logged and otherwise ignored —
  // never treated as a sign-out — since `onAuthStateChange` above remains
  // the sole source of truth for actual sign-out events.
  useEffect(() => {
    if (!isSupabaseConfigured) return undefined

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return
      authLog('tab became visible — re-checking session (read-only)')
      authService
        .getSession()
        .then((current) => {
          setSession((prev) => (prev?.access_token === current?.access_token ? prev : current))
          setUser((prev) => {
            const nextUser = current?.user ?? null
            if (prev?.id === nextUser?.id) return prev
            authLog('tab-wake session check found a different user than before', {
              previousUserId: prev?.id ?? null,
              nextUserId: nextUser?.id ?? null,
            })
            return nextUser
          })
        })
        .catch((err) => {
          console.warn('[lagamless auth] session re-check on tab wake failed; keeping last known state.', err)
        })
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // Loads (or clears) the profile row + admin status whenever *which
  // user* is signed in changes. Both requests run in parallel and are
  // independent of one another: a failed profile SELECT must never make
  // `isAdmin` look non-admin, and a failed `is_admin()` RPC must never
  // make the profile row disappear.
  const loadProfileAndAdminStatus = useCallback(async (forUser) => {
    const requestId = ++profileRequestId.current

    if (!forUser) {
      setProfile(null)
      setProfileError(null)
      setAdminCheckError(null)
      setIsAdmin(null) // nothing to verify when signed out — not "confirmed non-admin"
      setProfileLoading(false)
      return
    }

    setProfileLoading(true)

    // PERFORMANCE OPTIMIZATION PASS 01: `forUser.id` is already a
    // verified id from this context's own session-restore/auth-listener
    // logic above — passing it in lets `getMyProfile` skip a redundant
    // `supabase.auth.getUser()` round-trip. See the comment on
    // `getMyProfile` in `src/services/profiles.js` for why this doesn't
    // weaken authorization (RLS is still the real check, every time).
    const [profileResult, adminResult] = await Promise.all([getMyProfile(forUser.id), checkIsAdmin()])

    // A newer request started (user changed again) while these were in
    // flight — drop this result instead of clobbering the newer one.
    if (requestId !== profileRequestId.current) return

    setProfile(profileResult.profile)
    setProfileError(profileResult.error)

    if (adminResult.error) {
      // The RPC itself failed (network/etc) — this is NOT "confirmed not
      // admin". Leave `isAdmin` exactly as it was (whatever was last
      // confirmed, or `null` if nothing has ever been confirmed yet) and
      // only surface the error for a retry UI.
      authLog('is_admin() check failed — leaving isAdmin unchanged', {
        userId: forUser.id,
        previousIsAdmin: isAdmin,
        error: adminResult.error,
      })
      setAdminCheckError(adminResult.error)
    } else {
      // The RPC succeeded and gave a real, authoritative answer.
      authLog('is_admin() confirmed', { userId: forUser.id, isAdmin: adminResult.isAdmin })
      setIsAdmin(adminResult.isAdmin)
      setAdminCheckError(null)
    }

    setProfileLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let active = true
    const userId = user?.id ?? null

    authLog('profile/admin verification effect running for user id', userId)

    loadProfileAndAdminStatus(user).catch((err) => {
      // Belt-and-suspenders: getMyProfile()/checkIsAdmin() already catch
      // their own Supabase errors and never throw, but if something
      // unexpected does throw, fail loudly instead of leaving
      // `profileLoading` stuck `true` forever.
      if (!active) return
      console.error('[lagamless auth] unexpected error resolving profile/admin state.', err)
      setProfileError(err)
      setProfileLoading(false)
    })

    return () => {
      active = false
    }
    // Deliberately keyed on the user's *id* (a stable primitive), not the
    // `user` object itself. `onAuthStateChange` delivers a brand-new
    // `session.user` object reference on TOKEN_REFRESHED even when it's
    // the exact same person — keying on the object would re-run this
    // effect (and re-hit `profiles` + `is_admin()`) on essentially every
    // tab focus, which is both wasteful and (see the file header) the
    // actual cause of the tab-switch redirect bug. Keying on `.id` means
    // this only re-runs on a genuine sign-in/sign-out/different-user
    // event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, loadProfileAndAdminStatus])

  // Exposed so a page can force a fresh read after something that could
  // change the profile/admin state server-side — e.g. an admin just
  // promoted this account from the Supabase dashboard and the user wants
  // to retry without a full sign-out/sign-in cycle.
  const refreshProfile = useCallback(() => loadProfileAndAdminStatus(user), [loadProfileAndAdminStatus, user])

  const signIn = useCallback(async (email, password) => {
    const result = await authService.signIn({ email, password })
    setSession(result.session)
    setUser(result.user)
    return result
  }, [])

  const signUp = useCallback(async (fullName, email, password) => {
    const result = await authService.signUp({ fullName, email, password })
    // Only adopt the session if one came back — with email confirmation
    // enabled, `data.session` is null until the user confirms, and we
    // must not show them as signed in until that happens.
    if (result.session) {
      setSession(result.session)
      setUser(result.user)
    }
    return result
  }, [])

  const signOut = useCallback(async () => {
    authLog('explicit signOut() called')
    await authService.signOut()
    profileRequestId.current += 1 // invalidate any in-flight profile/admin fetch
    setSession(null)
    setUser(null)
    setProfile(null)
    setProfileError(null)
    setAdminCheckError(null)
    setIsAdmin(null)
    setProfileLoading(false)
    setSessionCheckError(null)
  }, [])

  const resetPassword = useCallback((email) => authService.resetPassword(email), [])

  const updatePassword = useCallback((newPassword) => authService.updatePassword(newPassword), [])

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      isAuthenticated: Boolean(user),
      isSupabaseConfigured,
      profile,
      profileError,
      profileLoading,
      // Tri-state: null = unknown/checking, true = confirmed admin,
      // false = confirmed not admin. See file header.
      isAdmin,
      adminCheckError,
      sessionCheckError,
      retrySessionCheck,
      refreshProfile,
      signIn,
      signUp,
      signOut,
      resetPassword,
      updatePassword,
    }),
    [
      user,
      session,
      loading,
      profile,
      profileError,
      profileLoading,
      isAdmin,
      adminCheckError,
      sessionCheckError,
      retrySessionCheck,
      refreshProfile,
      signIn,
      signUp,
      signOut,
      resetPassword,
      updatePassword,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
