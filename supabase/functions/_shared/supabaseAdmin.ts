import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ANON_KEY are all
// injected automatically into every Edge Function's environment by Supabase
// for the linked project — none of them need to be set with
// `supabase secrets set`.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''

// Service-role client. These functions are the only code path allowed to
// write to orders/order_items/payments (see
// supabase/part-10-razorpay-checkout.sql), so it must bypass RLS. NEVER
// import this file, or anything that re-exports `supabaseAdmin`, into
// frontend (src/) code.
export const supabaseAdmin = createClient(
  SUPABASE_URL,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
)

// Anon-key client — same key the storefront itself uses. `products` and
// `product_variants` already have a public "read published rows" RLS
// policy (see schema.sql), so any lookup that only ever needs *published*
// product/stock data can go through this client instead of supabaseAdmin.
// This keeps those reads working even in projects where the service-role
// key hasn't (yet) been re-linked/redeployed, without loosening anything:
// it's the exact same data an anonymous shopper can already see on
// /shop and /product/:slug.
export const supabasePublic = createClient(
  SUPABASE_URL,
  Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
)

/**
 * Resolves the calling customer's user id from the request's Authorization
 * header, if present. Checkout works for guests too, so a missing/invalid
 * token is not an error — it just means `customer_id` stays null on the
 * order (a guest order, exactly like the schema already anticipates).
 */
export async function getUserIdFromRequest(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice('Bearer '.length)
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user.id
}

/**
 * Resolves the calling user's id from the request's Authorization header
 * AND confirms `profiles.role = 'admin'` for that user — the same check
 * `public.is_admin()` performs inside Postgres RLS policies
 * (part-08b2a-admin-security.sql), reimplemented here because this
 * service-role client has no `auth.uid()` of its own to evaluate that
 * function against (service-role requests carry no user JWT claims for
 * Postgres to read). Used by admin-only edge functions — currently just
 * `initiate-return-refund` — that must run with the service-role key (to
 * reach RAZORPAY_KEY_SECRET) but still need to reject a non-admin caller
 * before doing anything, the same way the "Admins can manage returns" RLS
 * policy already rejects a non-admin's direct table write.
 *
 * Returns `null` (never throws) for: no/malformed Authorization header, an
 * invalid/expired token, no matching `profiles` row, or a `profiles` row
 * whose `role` isn't `'admin'`. Callers should treat `null` as "reject
 * this request", not distinguish why.
 */
export async function getAdminUserIdFromRequest(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice('Bearer '.length)
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
  if (userError || !userData?.user) return null

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (profileError || !profile || profile.role !== 'admin') return null

  return userData.user.id
}
