import { supabase, isSupabaseConfigured } from '../lib/supabase.js'

/**
 * Admin customers service — real Supabase, read-only, against `profiles`.
 *
 * SECURITY: this deliberately never touches `auth.users`. Email addresses
 * live in Supabase Auth's own `auth.users` table, which is not exposed to
 * the browser (and never should be — that table also holds password
 * hashes and other auth internals). `profiles` — the table this service
 * actually reads — has no `email` column, so a customer's email is
 * genuinely not available here without a secure server-side function
 * (e.g. a Supabase Edge Function using the service-role key, which must
 * never run in this frontend). `getCustomers()` returns `email: null` for
 * every row, and the admin UI shows that honestly instead of guessing or
 * fabricating a value.
 *
 * Every query runs under the RLS policies added in
 * `supabase/part-08b2a-admin-security.sql` ("Admins can read all
 * profiles", "Admins can manage orders") — this only ever succeeds for a
 * signed-in user whose own `profiles.role` is `'admin'`.
 */

function requireSupabase() {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see supabase/SETUP.md) before using the admin panel.',
    )
  }
}

/**
 * Fetches every customer profile plus order count / total spent, computed
 * from the `orders` table (one query for all orders, aggregated client-
 * side — cheap at this scale and avoids an N+1 query per customer).
 * @returns {Promise<Array<{id: string, fullName: string|null, email: null, phone: string|null, role: string, createdAt: string, orderCount: number, totalSpent: number}>>}
 */
export async function getCustomers() {
  requireSupabase()

  const [profilesResult, ordersResult] = await Promise.all([
    supabase.from('profiles').select('id, full_name, phone, role, created_at').order('created_at', { ascending: false }),
    supabase.from('orders').select('customer_id, total, subtotal'),
  ])

  if (profilesResult.error) throw profilesResult.error
  if (ordersResult.error) throw ordersResult.error

  const statsByCustomer = {}
  for (const order of ordersResult.data || []) {
    if (!order.customer_id) continue
    const bucket = statsByCustomer[order.customer_id] || { orderCount: 0, totalSpent: 0 }
    bucket.orderCount += 1
    bucket.totalSpent += Number(order.total ?? order.subtotal ?? 0)
    statsByCustomer[order.customer_id] = bucket
  }

  return (profilesResult.data || []).map((profile) => ({
    id: profile.id,
    fullName: profile.full_name,
    email: null, // see file-level note — not available from `profiles`
    phone: profile.phone,
    role: profile.role,
    createdAt: profile.created_at,
    orderCount: statsByCustomer[profile.id]?.orderCount ?? 0,
    totalSpent: statsByCustomer[profile.id]?.totalSpent ?? 0,
  }))
}

/**
 * Lightweight count of customer accounts, for the dashboard — avoids
 * pulling every profile row + aggregating orders just to show one number.
 * @returns {Promise<number>}
 */
export async function getCustomerCount() {
  requireSupabase()
  const { count, error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'customer')
  if (error) throw error
  return count ?? 0
}
