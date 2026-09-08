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
 * @returns {Promise<Profile | null>}
 */
export async function getMyProfile() {
  if (!isSupabaseConfigured || !supabase) return null

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()

  if (error) {
    console.error('getMyProfile: failed to load profile.', error)
    return null
  }

  return data
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
