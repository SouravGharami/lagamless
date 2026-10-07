import { supabase, isSupabaseConfigured } from '../lib/supabase.js'

/**
 * Profile service — reads and updates the `profiles` row for the
 * *currently authenticated* user only.
 *
 * There is deliberately no `getProfile(userId)` or `updateProfile(userId, ...)`
 * exported here — every function derives the target row from
 * `supabase.auth.getUser()` server-side via Row Level Security
 * (`auth.uid() = id`, see `supabase/part-08b1-auth.sql`), so a customer can
 * never read or write another user's profile even if the frontend code
 * were modified. Admin-scoped profile access (e.g. an admin customer list)
 * is out of scope for this part — see Part 08B-2.
 *
 * @typedef {Object} Profile
 * @property {string} id
 * @property {string|null} full_name
 * @property {string|null} phone
 * @property {'customer'|'admin'} role
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * Fetches the signed-in user's own profile row.
 *
 * Unlike the old version of this function, a failed query is never
 * silently swallowed into `null` — that made a Supabase error
 * indistinguishable from "this user genuinely has no profile row", and
 * `Account.jsx` used to compound the problem by defaulting the displayed
 * role to `'customer'` whenever the value was falsy. Callers must check
 * `error` explicitly and must NOT assume `profile === null` means
 * "customer".
 *
 * @param {string} [knownUserId] - PERFORMANCE OPTIMIZATION PASS 01: when
 *   the caller already has a trustworthy user id in hand (this is always
 *   true for `AuthContext`, which only ever calls this after its own
 *   `getSession()`/`onAuthStateChange` has resolved a real session), pass
 *   it here to skip an extra `supabase.auth.getUser()` network round-trip
 *   that would otherwise re-derive the exact same id. This does NOT
 *   weaken security: `auth.getUser()` here was never the authorization
 *   check — the actual boundary is the `profiles` RLS policy
 *   (`auth.uid() = id`, see `supabase/part-08b1-auth.sql`), which
 *   PostgREST enforces server-side from the request's JWT on every call
 *   below regardless of which id this function passes into `.eq('id',
 *   ...)`. If the JWT were invalid/expired, this query would simply fail
 *   (returned as `error`), exactly as it always has. Omit this argument
 *   (as any future caller other than `AuthContext` should, unless it also
 *   already has a verified id) to fall back to the original
 *   `auth.getUser()`-derived behavior, unchanged.
 * @returns {Promise<{ profile: Profile | null, error: Error | import('@supabase/supabase-js').PostgrestError | null }>}
 */
export async function getMyProfile(knownUserId) {
  if (!isSupabaseConfigured || !supabase) {
    return { profile: null, error: null }
  }

  let userId = knownUserId ?? null

  if (!userId) {
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError) {
      console.error('getMyProfile: supabase.auth.getUser() failed.', userError)
      return { profile: null, error: userError }
    }
    const user = userData?.user
    if (!user) {
      // Genuinely signed out — not an error, just nothing to fetch.
      return { profile: null, error: null }
    }
    userId = user.id
  }

  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()

  if (error) {
    // Surfaced loudly on purpose: a failed profile read must never look
    // the same as "this user is a customer" to anything downstream.
    console.error('getMyProfile: failed to load profile row for', userId, error)
    return { profile: null, error }
  }

  if (!data) {
    // Every auth user gets a profiles row from handle_new_auth_user() at
    // signup time (supabase/part-08b1-auth.sql) — a signed-in user with
    // no row at all is unexpected, not the normal "customer" case. Log it
    // so it doesn't get mistaken for a query failure or ignored.
    console.error('getMyProfile: signed-in user has no profiles row.', userId)
  }

  return { profile: data ?? null, error: null }
}

/**
 * Asks the database, via the existing `public.is_admin()` SECURITY
 * DEFINER function (see `supabase/part-08b2a-admin-security.sql`),
 * whether the signed-in user is an admin.
 *
 * This is deliberately used as the *authoritative* signal for
 * admin-gating instead of solely trusting `getMyProfile().profile.role`:
 * `is_admin()` runs server-side against `auth.uid()` and returns a single
 * boolean, so it has nothing to parse and nowhere for a partial/failed
 * `select('*')` response to be misread as "not an admin". It is still
 * just a UI-gating signal, not the real authorization boundary — every
 * RLS policy re-checks `is_admin()` itself on the database side
 * regardless of what the client believes.
 *
 * @returns {Promise<{ isAdmin: boolean, error: Error | import('@supabase/supabase-js').PostgrestError | null }>}
 */
export async function checkIsAdmin() {
  if (!isSupabaseConfigured || !supabase) {
    return { isAdmin: false, error: null }
  }

  const { data, error } = await supabase.rpc('is_admin')

  if (error) {
    console.error('checkIsAdmin: public.is_admin() RPC failed.', error)
    return { isAdmin: false, error }
  }

  return { isAdmin: data === true, error: null }
}

/**
 * Updates editable fields on the signed-in user's own profile.
 * `role` is intentionally not accepted here — role changes are not a
 * customer-facing feature in this project (see Part 08B-2 for admin
 * management), and RLS backs this up server-side regardless.
 *
 * @param {{ fullName?: string, phone?: string }} updates
 * @returns {Promise<Profile>}
 */
export async function updateMyProfile({ fullName, phone } = {}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Accounts are not available yet — this project has not been connected to Supabase.')
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be signed in to update your profile.')

  const patch = {}
  if (fullName !== undefined) patch.full_name = fullName.trim()
  if (phone !== undefined) patch.phone = phone.trim()

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', user.id)
    .select()
    .single()

  if (error) throw error
  return data
}
