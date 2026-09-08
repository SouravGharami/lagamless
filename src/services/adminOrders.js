import { supabase, isSupabaseConfigured } from '../lib/supabase.js'

/**
 * Admin orders service — real Supabase, read-only.
 *
 * Checkout does not create real orders yet (that lands in Part 09), so
 * `getOrders()` will legitimately resolve to an empty array against a
 * fresh project — that is a correct, honest result, not a bug. Nothing
 * here fabricates a row. Every query runs under the RLS policy added in
 * `supabase/part-08b2a-admin-security.sql` ("Admins can manage orders"),
 * so this only ever succeeds for a signed-in user whose `profiles.role`
 * is `'admin'`.
 */

function requireSupabase() {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see supabase/SETUP.md) before using the admin panel.',
    )
  }
}

const ADMIN_ORDER_SELECT = '*, order_items(*), payments(*)'

/** Maps a Supabase `orders` row (with joined `order_items`/`payments`) onto a camelCase shape. */
function mapOrder(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerEmail: row.customer_email,
    customerName: row.customer_name,
    status: row.status,
    subtotal: Number(row.subtotal) || 0,
    shippingTotal: row.shipping_total === null || row.shipping_total === undefined ? null : Number(row.shipping_total),
    discountTotal: Number(row.discount_total) || 0,
    total: row.total === null || row.total === undefined ? null : Number(row.total),
    shippingAddress: row.shipping_address || null,
    createdAt: row.created_at,
    items: (row.order_items || []).map((item) => ({
      id: item.id,
      productId: item.product_id,
      variantId: item.variant_id,
      productName: item.product_name,
      sku: item.sku,
      size: item.size,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price) || 0,
      lineTotal: Number(item.line_total) || 0,
    })),
    // `payments` is a separate table (Part 09 writes to it once a gateway
    // is connected). An order with no linked payment row yet — which is
    // every order today — resolves to an empty array, surfaced by the UI
    // as "Not available" rather than a guessed status.
    payments: (row.payments || []).map((p) => ({
      id: p.id,
      provider: p.provider,
      status: p.status,
      amount: Number(p.amount) || 0,
    })),
  }
}

/**
 * @returns {Promise<Array<ReturnType<typeof mapOrder>>>}
 */
export async function getOrders() {
  requireSupabase()
  const { data, error } = await supabase
    .from('orders')
    .select(ADMIN_ORDER_SELECT)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(mapOrder)
}

/**
 * @param {string} id
 * @returns {Promise<ReturnType<typeof mapOrder> | undefined>}
 */
export async function getOrder(id) {
  requireSupabase()
  const { data, error } = await supabase.from('orders').select(ADMIN_ORDER_SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? mapOrder(data) : undefined
}
