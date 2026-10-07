import { supabase, isSupabaseConfigured } from '../lib/supabase.js'

/**
 * Auth service — the seam between the UI (AuthContext, Login, Signup,
 * ForgotPassword, ResetPassword) and Supabase Auth.
 *
 * Part 08B-1 scope: customer authentication only. Every function here
 * delegates straight to `supabase.auth.*` — there is no custom token
 * handling, no manual password storage, and no service-role usage
 * anywhere in this file (see src/lib/supabase.js for why that's safe).
 *
 * Unlike src/services/products.js, there is deliberately **no local
 * fallback** here: authentication is meaningless without a real backend,
 * so every function throws a clear error when Supabase isn't configured
 * instead of silently pretending to sign someone in.
 */

const NOT_CONFIGURED_MESSAGE =
  'Accounts are not available yet — this project has not been connected to Supabase. See supabase/SETUP.md.'

function assertConfigured() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error(NOT_CONFIGURED_MESSAGE)
  }
}

/**
 * Creates a new Supabase Auth user. The corresponding `profiles` row
 * (role: 'customer', always) is created automatically by the database
 * trigger installed in `supabase/part-08b1-auth.sql` — the frontend never
 * inserts into `profiles` directly during signup, and never sends or
 * accepts a `role` field here. See §7 of that migration.
 *
 * @param {{ fullName: string, email: string, password: string }} input
 * @returns {Promise<{ user: import('@supabase/supabase-js').User | null, session: import('@supabase/supabase-js').Session | null, needsEmailConfirmation: boolean }>}
 */
export async function signUp({ fullName, email, password }) {
  assertConfigured()

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: { full_name: fullName.trim() },
    },
  })

  if (error) throw error

  // When email confirmation is enabled in the Supabase project, `signUp`
  // succeeds but returns a user with no active session yet (session is
  // null until the user clicks the confirmation link). Surface that
  // distinction so the UI never claims the person is signed in when
  // they're not.
  return {
    user: data.user,
    session: data.session,
    needsEmailConfirmation: Boolean(data.user) && !data.session,
  }
}

/**
 * @param {{ email: string, password: string }} input
 * @returns {Promise<{ user: import('@supabase/supabase-js').User, session: import('@supabase/supabase-js').Session }>}
 */
export async function signIn({ email, password }) {
  assertConfigured()

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  })

  if (error) throw error
  return { user: data.user, session: data.session }
}

/** Signs the current user out and clears the local Supabase session. */
export async function signOut() {
  assertConfigured()
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

/** @returns {Promise<import('@supabase/supabase-js').User | null>} */
export async function getCurrentUser() {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase.auth.getUser()
  if (error) return null
  return data.user
}

/**
 * Reads the current Supabase Auth session.
 *
 * Unlike the old version of this function, a failed check is never
 * silently folded into `null` — that made "Supabase couldn't verify the
 * session right now" (network hiccup, tab waking from suspension mid
 * token-refresh) indistinguishable from "there is definitely no session",
 * and callers (AuthContext) used the latter to redirect to `/login`. This
 * now throws on error so `AuthContext` can retry instead of logging an
 * authenticated admin out from underneath their in-progress form.
 *
 * @returns {Promise<import('@supabase/supabase-js').Session | null>}
 * @throws when the check itself fails (not when the user is simply signed out)
 */
export async function getSession() {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}

/**
 * Sends a password-reset email. `redirectTo` should point at
 * `/reset-password` on this site so Supabase's recovery link lands the
 * user back on `ResetPassword.jsx` with a recovery session already set.
 *
 * @param {string} email
 */
export async function resetPassword(email) {
  assertConfigured()
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/reset-password`,
  })
  if (error) throw error
}

/**
 * Updates the password for the currently active (recovery) session.
 * Only usable from the `/reset-password` page, after Supabase has set a
 * recovery session from the emailed link.
 *
 * @param {string} newPassword
 */
export async function updatePassword(newPassword) {
  assertConfigured()
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}

/**
 * Subscribes to Supabase Auth state changes (sign in, sign out, token
 * refresh, session restore). Returns an unsubscribe function.
 *
 * @param {(event: string, session: import('@supabase/supabase-js').Session | null) => void} callback
 * @returns {() => void}
 */
export function onAuthStateChange(callback) {
  if (!isSupabaseConfigured || !supabase) return () => {}
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(callback)
  return () => subscription.unsubscribe()
}
