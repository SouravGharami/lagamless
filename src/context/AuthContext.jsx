import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabase.js'
import * as authService from '../services/auth.js'
import { getMyProfile } from '../services/profiles.js'

/**
 * Auth context — centralized Supabase Auth state for the whole app
 * (Navbar, ProtectedRoute, Login, Signup, Account, ForgotPassword,
 * ResetPassword).
 *
 * Mirrors the shape of CartContext.jsx: a single provider wraps the app in
 * main.jsx, everything else reads/writes through `useAuth()`.
 *
 * `user`/`session` update automatically on sign-in, sign-out, session
 * restore, and token refresh via `onAuthStateChange` — no page refresh is
 * ever required, and no component needs to poll.
 */

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // `loading` is true until the very first session check (restore-from-
  // storage or "definitely signed out") resolves. Every consumer — most
  // importantly ProtectedRoute — waits on this before deciding whether to
  // redirect, so a signed-in user is never bounced to /login just because
  // the session hadn't finished restoring yet.
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)

  // `profile` mirrors the signed-in user's own `profiles` row (role,
  // full_name, etc.) — the only place `role` is ever read from. `AdminRoute`
  // (Part 08B-2A) waits on `profileLoading` the same way `ProtectedRoute`
  // waits on `loading`, so an admin is never bounced to /account just
  // because their profile hadn't finished loading yet. This is deliberately
  // *not* derived from anything in localStorage/the JWT on the client —
  // it's a live read of the `profiles` row, which is itself protected by
  // RLS and the `is_admin()` / role-immutability trigger added in
  // `supabase/part-08b2a-admin-security.sql`.
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)

  useEffect(() => {
    let active = true

    if (!isSupabaseConfigured) {
      setLoading(false)
      return undefined
    }

    authService.getSession().then((restoredSession) => {
      if (!active) return
      setSession(restoredSession)
      setUser(restoredSession?.user ?? null)
      setLoading(false)
    })

    // Fires on SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED, and
    // PASSWORD_RECOVERY — this single listener is what keeps the Navbar,
    // ProtectedRoute, and Account page in sync with zero manual wiring.
    const unsubscribe = authService.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      setLoading(false)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  // Loads (or clears) the profile row whenever *which user* is signed in
  // changes. Keyed on `user?.id` rather than `user` itself so this doesn't
  // re-fetch on every token refresh — only on actual sign-in/sign-out/
  // account switch.
  useEffect(() => {
    let active = true

    if (!user) {
      setProfile(null)
      setProfileLoading(false)
      return undefined
    }

    setProfileLoading(true)
    getMyProfile().then((row) => {
      if (!active) return
      setProfile(row)
      setProfileLoading(false)
    })

    return () => {
      active = false
    }
  }, [user])

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
    await authService.signOut()
    setSession(null)
    setUser(null)
    setProfile(null)
    setProfileLoading(false)
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
      // `profile`/`profileLoading` back `isAdmin` — see the effect above.
      // `isAdmin` is a derived convenience, always `profile?.role ===
      // 'admin'`; nothing ever sets it directly, so there's no path for a
      // component to "flip on" admin locally.
      profile,
      profileLoading,
      isAdmin: profile?.role === 'admin',
      signIn,
      signUp,
      signOut,
      resetPassword,
      updatePassword,
    }),
    [user, session, loading, profile, profileLoading, signIn, signUp, signOut, resetPassword, updatePassword],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
