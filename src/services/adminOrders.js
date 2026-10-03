import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { ORDER_ITEM_IMAGE_EMBED, pickOrderItemImage } from '../lib/orderItemImage.js'

/**
 * Admin orders service — real Supabase, read-only.
 *
 * As of Part 10, checkout creates real orders via the `create-razorpay-order`
 * edge function (service-role, bypasses RLS), so `getOrders()` reflects
 * actual checkouts once at least one has happened against this project.
 * Every query here still runs under the RLS policy added in
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

const ADMIN_ORDER_SELECT = `*, order_items(*, ${ORDER_ITEM_IMAGE_EMBED}), payments(*)`

/**
 * Turns a Supabase/PostgREST error into a message that actually says what
 * went wrong, instead of a generic "failed to load orders". PostgREST
 * errors carry a `code` (Postgres SQLSTATE, e.g. `42501` = insufficient
 * privilege — a missing GRANT; `PGRST301`/`PGRST116` = PostgREST-level
 * issues) plus `details`/`hint` that are usually the most useful part and
 * were previously being silently dropped by `throw error` +
 * `err.message`. Logged in full to the console either way, so the browser
 * console is always the ground truth even if this summarization ever
 * misses something.
 * @param {Error | import('@supabase/supabase-js').PostgrestError} error
 * @param {string} action - short description, e.g. "load orders"
 */
function describeSupabaseError(error, action) {
  console.error(`adminOrders: failed to ${action}.`, error)
  const parts = []
  if (error?.code) parts.push(`[${error.code}]`)
  parts.push(error?.message || String(error))
  if (error?.details) parts.push(`— ${error.details}`)
  if (error?.hint) parts.push(`(hint: ${error.hint})`)
  const detail = parts.join(' ')

  // The two most common root causes in this project's history get a
  // plain-English pointer on top of the raw Postgrest text, since
  // "permission denied for table orders" / an RLS-shaped empty result are
  // exactly the two failure modes part-13 and part-08b2a exist to fix.
  if (error?.code === '42501') {
    return `Could not ${action}: ${detail} — this is a missing table GRANT, not an RLS problem. Run supabase/part-15-orders-diagnostic-and-fix.sql in the Supabase SQL Editor.`
  }
  return `Could not ${action}: ${detail}`
}

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
    deliveryMethod: row.delivery_method || 'standard',
    createdAt: row.created_at,
    trackingCourier: row.tracking_courier || null,
    trackingId: row.tracking_id || null,
    trackingUrl: row.tracking_url || null,
    shippedAt: row.shipped_at || null,
    deliveredAt: row.delivered_at || null,
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
      imageUrl: pickOrderItemImage(item.products),
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
      // COD only: when the admin recorded the money, how it arrived
      // ('cash' | 'upi' | 'other') and an optional reference (UPI txn id…).
      paidAt: p.paid_at || null,
      collectionMethod: p.collection_method || null,
      reference: p.provider_reference || null,
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
  if (error) throw new Error(describeSupabaseError(error, 'load orders'))
  return (data || []).map(mapOrder)
}

/**
 * Bare row count on `orders` with no joins and no RLS-filtered columns
 * selected — used only to tell apart "the join to order_items/payments is
 * what's failing" from "orders itself is empty/blocked" when `getOrders()`
 * comes back empty or erroring. Never used for the main table render.
 * @returns {Promise<{ count: number | null, error: string | null }>}
 */
export async function getOrdersRawCount() {
  if (!isSupabaseConfigured) return { count: null, error: 'Supabase is not configured.' }
  const { count, error } = await supabase.from('orders').select('id', { count: 'exact', head: true })
  if (error) return { count: null, error: describeSupabaseError(error, 'count orders') }
  return { count, error: null }
}

/**
 * @param {string} id
 * @returns {Promise<ReturnType<typeof mapOrder> | undefined>}
 */
export async function getOrder(id) {
  requireSupabase()
  const { data, error } = await supabase.from('orders').select(ADMIN_ORDER_SELECT).eq('id', id).maybeSingle()
  if (error) throw new Error(describeSupabaseError(error, 'load this order'))
  return data ? mapOrder(data) : undefined
}

/** Every value `orders.status` accepts (matches the DB check constraint added in part-10). */
export const ORDER_STATUSES = [
  'pending',
  'payment_failed',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
]

/**
 * Updates an order's status. Requires the signed-in user to be an admin —
 * enforced by the "Admins can manage orders" RLS policy
 * (part-08b2a-admin-security.sql) plus the table grants added in
 * part-13-orders-grants-fix.sql. Any other caller gets 0 rows affected
 * rather than an error (RLS silently filters), which is surfaced here as
 * a thrown error so the UI doesn't say "saved" when nothing changed.
 *
 * @param {string} id
 * @param {string} status - one of ORDER_STATUSES
 * @param {{ trackingCourier?: string, trackingId?: string, trackingUrl?: string }} [tracking] -
 *   optional, written in the same update. Only meaningful when status is
 *   'shipped', but not restricted to it.
 * @returns {Promise<ReturnType<typeof mapOrder>>}
 */
export async function updateOrderStatus(id, status, tracking) {
  requireSupabase()
  if (!ORDER_STATUSES.includes(status)) {
    throw new Error(`"${status}" is not a valid order status.`)
  }
  const patch = { status }
  if (tracking) {
    if (tracking.trackingCourier !== undefined) patch.tracking_courier = tracking.trackingCourier || null
    if (tracking.trackingId !== undefined) patch.tracking_id = tracking.trackingId || null
    if (tracking.trackingUrl !== undefined) patch.tracking_url = tracking.trackingUrl || null
  }
  // Stamp shipped_at the first time an order becomes 'shipped' so the
  // customer-facing page has a "shipped on" date that doesn't drift every
  // time the order later moves on to delivered/etc.
  if (status === 'shipped') patch.shipped_at = new Date().toISOString()

  // Same idea for delivered_at, with one extra guard: if the order is
  // already delivered and gets saved again (e.g. re-confirming tracking),
  // we must NOT stomp the original delivered_at with a new timestamp. So
  // look up the current value first and only stamp it when it's not set
  // yet.
  if (status === 'delivered') {
    const { data: existing, error: fetchError } = await supabase
      .from('orders')
      .select('delivered_at')
      .eq('id', id)
      .maybeSingle()
    if (fetchError) throw new Error(describeSupabaseError(fetchError, "check this order's current delivered_at"))
    if (!existing?.delivered_at) {
      patch.delivered_at = new Date().toISOString()
    }
  }

  const { data, error } = await supabase
    .from('orders')
    .update(patch)
    .eq('id', id)
    .select(ADMIN_ORDER_SELECT)
    .maybeSingle()
  if (error) throw new Error(describeSupabaseError(error, 'update this order\'s status'))
  if (!data) {
    throw new Error(
      "Order status wasn't updated — 0 rows matched. Your account is either not signed in as an admin (profiles.role must be 'admin' for this user) or the order id no longer exists. Run supabase/part-15-orders-diagnostic-and-fix.sql and check its B4 result to confirm your account is admin.",
    )
  }
  return mapOrder(data)
}

/**
 * Updates just an order's shipment tracking details with no status
 * change — used to fix a typo'd courier/tracking id/link after the order
 * has already been marked shipped, without re-stamping shipped_at.
 *
 * @param {string} id
 * @param {{ trackingCourier?: string, trackingId?: string, trackingUrl?: string }} tracking
 * @returns {Promise<ReturnType<typeof mapOrder>>}
 */
export async function updateOrderTracking(id, tracking) {
  requireSupabase()
  const patch = {
    tracking_courier: tracking.trackingCourier || null,
    tracking_id: tracking.trackingId || null,
    tracking_url: tracking.trackingUrl || null,
  }
  const { data, error } = await supabase
    .from('orders')
    .update(patch)
    .eq('id', id)
    .select(ADMIN_ORDER_SELECT)
    .maybeSingle()
  if (error) throw new Error(describeSupabaseError(error, 'update this order\'s tracking details'))
  if (!data) {
    throw new Error("Tracking details weren't updated — 0 rows matched. Your account may not be signed in as an admin.")
  }
  return mapOrder(data)
}

/**
 * The Cash-on-Delivery payment on an order, or undefined for online orders.
 * @param {ReturnType<typeof mapOrder>} order
 */
export function getCodPayment(order) {
  return [...order.payments].reverse().find((p) => p.provider === 'cod')
}

/** True when a COD order is still owed money (unpaid, not cancelled/failed). */
export function isCodUnpaid(order) {
  const cod = getCodPayment(order)
  return Boolean(cod) && cod.status === 'pending' && !['cancelled', 'payment_failed'].includes(order.status)
}

export const COLLECTION_METHODS = [
  { key: 'cash', label: 'Cash' },
  { key: 'upi', label: 'UPI' },
  { key: 'other', label: 'Other' },
]

/**
 * Marks a Cash-on-Delivery order's payment as paid (or undoes it). Goes
 * through the admin-only `set_cod_payment_status` Postgres function
 * (part-25-cod-manual-payment.sql), which is atomic, idempotent, and refuses
 * cancelled/refunded orders — so the UI can't put a payment into a state the
 * database wouldn't accept. Returns the refreshed order.
 *
 * @param {string} id - order id
 * @param {boolean} paid - true = mark paid, false = undo (back to unpaid)
 * @param {{ method?: 'cash'|'upi'|'other', reference?: string }} [details]
 * @returns {Promise<ReturnType<typeof mapOrder>>}
 */
export async function setCodPaymentStatus(id, paid, details = {}) {
  requireSupabase()
  const { error } = await supabase.rpc('set_cod_payment_status', {
    p_order_id: id,
    p_paid: paid,
    p_method: paid ? details.method || 'cash' : null,
    p_reference: paid ? details.reference?.trim() || null : null,
  })
  if (error) {
    // The function raises 'CODE|message' — show just the message part.
    const friendly = typeof error.message === 'string' && error.message.includes('|')
      ? error.message.split('|').slice(1).join('|')
      : null
    if (friendly) {
      console.error('adminOrders: set_cod_payment_status rejected.', error)
      throw new Error(friendly)
    }
    if (error.code === 'PGRST202' || error.code === '42883') {
      throw new Error(
        'The payment function is missing — run supabase/part-25-cod-manual-payment.sql in the Supabase SQL Editor, then try again.',
      )
    }
    throw new Error(describeSupabaseError(error, 'update this order\'s payment'))
  }
  const updated = await getOrder(id)
  if (!updated) throw new Error('Payment saved, but the order could not be reloaded.')
  return updated
}
