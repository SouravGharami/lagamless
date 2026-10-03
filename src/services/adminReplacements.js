import { supabase, isSupabaseConfigured } from '../lib/supabase.js'

/**
 * Admin replacements service — real Supabase, same shape as
 * src/services/adminReturns.js but for the separate replacement workflow.
 *
 * Reads/writes `public.replacements` as the signed-in admin's own session
 * under the "Admins can manage replacements" policy + grant from
 * supabase/part-26-replacements.sql — run that migration first, then
 * part-27-replacements-admin-note.sql and part-28-replacements-lifecycle.sql.
 *
 *   requested -> awaiting_return -> return_received -> replacement_processing
 *             -> replacement_shipped -> replacement_completed
 *   requested -> rejected                       (Reject, at the request stage)
 *   return_received -> rejected                 (Verification Failed)
 *
 * Approval and "Verification Failed" go through Postgres functions
 * (`approve_replacement`, `fail_replacement_verification`) because both need
 * to touch `product_variants.stock` atomically alongside the status change —
 * approval reserves stock, a failed verification releases it. Every other
 * transition is a guarded UPDATE (`.eq('status', fromStatus)`), so a step
 * can't be applied twice or out of order even if two admins click at once.
 */

function requireSupabase() {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see supabase/SETUP.md) before using the admin panel.',
    )
  }
}

const ADMIN_REPLACEMENT_SELECT =
  '*, orders(id, customer_name, customer_email, shipping_address), ' +
  'order_items(product_name, sku, size, products(product_images(image_url, image_type, sort_order)))'

/** Every value this admin UI writes to `replacements.status`. */
export const REPLACEMENT_STATUSES = [
  'requested',
  'awaiting_return',
  'return_received',
  'replacement_processing',
  'replacement_shipped',
  'replacement_completed',
  'rejected',
]

function describeSupabaseError(error, action) {
  console.error(`adminReplacements: failed to ${action}.`, error)
  const parts = []
  if (error?.code) parts.push(`[${error.code}]`)
  parts.push(error?.message || String(error))
  if (error?.details) parts.push(`— ${error.details}`)
  if (error?.hint) parts.push(`(hint: ${error.hint})`)
  const detail = parts.join(' ')

  if (error?.code === '42501') {
    return `Could not ${action}: ${detail} — this is a missing table GRANT, not an RLS problem. Run supabase/part-26-replacements.sql in the Supabase SQL Editor.`
  }
  if (error?.code === '42P01') {
    return `Could not ${action}: ${detail} — the replacements table doesn't exist yet. Run supabase/part-26-replacements.sql in the Supabase SQL Editor.`
  }
  if (error?.code === '42703') {
    return `Could not ${action}: ${detail} — a column this page expects is missing. Run supabase/part-28-replacements-lifecycle.sql in the Supabase SQL Editor.`
  }
  return `Could not ${action}: ${detail}`
}

/** Picks the best product image for a replacement row: 'main' type first, else lowest sort_order. */
function pickProductImage(row) {
  const images = row.order_items?.products?.product_images
  if (!Array.isArray(images) || images.length === 0) return null
  const main = images.find((img) => img.image_type === 'main' && img.image_url)
  if (main) return main.image_url
  const sorted = [...images].filter((img) => img.image_url).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  return sorted[0]?.image_url || null
}

function mapReplacement(row, openReturnKeys) {
  const orderId = row.order_id
  return {
    id: row.id,
    orderId,
    orderItemId: row.order_item_id,
    customerEmail: row.customer_email,
    customerName: row.orders?.customer_name || null,
    customerPhone: row.orders?.shipping_address?.phone || null,
    productName: row.order_items?.product_name || null,
    productImage: pickProductImage(row),
    sku: row.order_items?.sku || null,
    originalSize: row.original_size || row.order_items?.size || null,
    // Always null today — checkout has never recorded which color a customer
    // bought (see the header note in part-26). Kept as its own field so the
    // admin UI can show "—" honestly instead of hiding the column.
    originalColor: row.original_color || null,
    requestedSize: row.requested_size,
    // null = "keep the same color" (checkout never recorded the original color).
    requestedColor: row.requested_color || null,
    quantity: row.quantity,
    reason: row.reason,
    customerNote: row.customer_note || null,
    status: row.status,
    // Reused for BOTH terminal-rejection reasons: a Reject at the `requested`
    // stage, and a "Verification Failed" outcome from `return_received` —
    // same one-column pattern returns' inspection stage uses (part-22).
    rejectionReason: row.rejection_reason || null,
    // Internal-only note an admin can leave on a request; never shown to the customer.
    adminNote: row.admin_note || null,
    stockReserved: Boolean(row.stock_reserved),
    requestedAt: row.requested_at,
    approvedAt: row.approved_at || null,
    returnReceivedAt: row.return_received_at || null,
    verifiedAt: row.verified_at || null,
    shippedAt: row.shipped_at || null,
    deliveredAt: row.delivered_at || null,
    trackingCourier: row.tracking_courier || null,
    trackingId: row.tracking_id || null,
    trackingUrl: row.tracking_url || null,
    // Replacement and Return are separate workflows, and the customer-side
    // Return flow doesn't know about replacements. If a return was opened on
    // the same item (or the whole order) too, flag it so the admin doesn't
    // send a replacement AND refund the same product.
    hasOpenReturn: openReturnKeys.has(`${orderId}:${row.order_item_id}`) || openReturnKeys.has(`${orderId}:*`),
  }
}

/**
 * Keys of every non-rejected return, as `${orderId}:${orderItemId}` (or
 * `${orderId}:*` for an order-level return). Best-effort — if `returns` can't
 * be read the replacement list still loads, just without the warning flag.
 */
async function loadOpenReturnKeys(orderIds) {
  const keys = new Set()
  if (orderIds.length === 0) return keys
  const { data, error } = await supabase
    .from('returns')
    .select('order_id, order_item_id')
    .in('order_id', orderIds)
    .neq('status', 'rejected')
  if (error) {
    console.warn('adminReplacements: could not check for open returns.', error)
    return keys
  }
  for (const ret of data || []) keys.add(`${ret.order_id}:${ret.order_item_id ?? '*'}`)
  return keys
}

async function mapRows(rows) {
  const openReturnKeys = await loadOpenReturnKeys([...new Set(rows.map((r) => r.order_id))])
  return rows.map((row) => mapReplacement(row, openReturnKeys))
}

/** @returns {Promise<Array<ReturnType<typeof mapReplacement>>>} */
export async function getReplacements() {
  requireSupabase()
  const { data, error } = await supabase
    .from('replacements')
    .select(ADMIN_REPLACEMENT_SELECT)
    .order('requested_at', { ascending: false })
  if (error) throw new Error(describeSupabaseError(error, 'load replacements'))
  return mapRows(data || [])
}

async function getReplacement(id) {
  const { data, error } = await supabase
    .from('replacements')
    .select(ADMIN_REPLACEMENT_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(describeSupabaseError(error, 'reload this replacement'))
  if (!data) throw new Error('This replacement request no longer exists.')
  return (await mapRows([data]))[0]
}

/**
 * Guarded status transition. A row that isn't currently `fromStatus` matches
 * zero rows — surfaced as an error so the UI never claims "saved" when nothing
 * changed (someone else already moved it, or the account isn't an admin).
 */
async function transitionReplacement(id, fromStatus, patch) {
  requireSupabase()
  if (!REPLACEMENT_STATUSES.includes(patch.status)) {
    throw new Error(`"${patch.status}" is not a valid replacement status.`)
  }
  const { data, error } = await supabase
    .from('replacements')
    .update(patch)
    .eq('id', id)
    .eq('status', fromStatus)
    .select(ADMIN_REPLACEMENT_SELECT)
    .maybeSingle()
  if (error) throw new Error(describeSupabaseError(error, `mark this replacement as ${patch.status}`))
  if (!data) {
    throw new Error(
      `Replacement status wasn't updated — 0 rows matched. Either this request is no longer "${fromStatus}" (refresh to see its current status), your account isn't signed in as an admin, or it no longer exists.`,
    )
  }
  return (await mapRows([data]))[0]
}

/** Business errors from our RPCs look like 'CODE|message' — show just the message. */
function unwrapRpcError(error, action) {
  const [code, ...rest] = (error.message ?? '').split('|')
  if (rest.length > 0 && /^[A-Z_]+$/.test(code)) return new Error(rest.join('|').trim())
  return new Error(describeSupabaseError(error, action))
}

/**
 * Approves a `requested` replacement AND reserves its stock in one atomic
 * step (`approve_replacement`), validating the requested size (in stock) and
 * color (still offered) as it does. Fails with a readable message — e.g.
 * "Only 0 left in size L" or "Olive is no longer an available color" — if
 * either isn't true by the time the admin clicks. Lands the request in
 * `awaiting_return`: the customer is now expected to send the original item
 * back before the replacement ships.
 */
export async function approveReplacement(id) {
  requireSupabase()
  const { error } = await supabase.rpc('approve_replacement', { p_replacement_id: id })
  if (error) throw unwrapRpcError(error, 'approve this replacement')
  return getReplacement(id)
}

/** Rejects a `requested` replacement; the reason is required and shown to the customer. */
export async function rejectReplacement(id, reason) {
  const trimmed = (reason || '').trim()
  if (!trimmed) throw new Error('A rejection reason is required.')
  return transitionReplacement(id, 'requested', { status: 'rejected', rejection_reason: trimmed })
}

/** awaiting_return -> return_received: the admin has the original item back in hand. */
export async function markReturnReceived(id) {
  return transitionReplacement(id, 'awaiting_return', {
    status: 'return_received',
    return_received_at: new Date().toISOString(),
  })
}

/** return_received -> replacement_processing: the returned item checked out fine. */
export async function markVerificationPassed(id) {
  return transitionReplacement(id, 'return_received', {
    status: 'replacement_processing',
    verified_at: new Date().toISOString(),
  })
}

/**
 * return_received -> rejected: the returned item failed verification (wrong
 * item, damage inconsistent with the stated reason, etc). Goes through
 * `fail_replacement_verification` because it also releases the stock that
 * was reserved at approval — that unit will no longer ship. The reason is
 * required and saved to the same `rejection_reason` column a plain Reject
 * uses, and is shown to the customer the same way.
 */
export async function failReplacementVerification(id, reason) {
  requireSupabase()
  const trimmed = (reason || '').trim()
  if (!trimmed) throw new Error('A reason is required when verification fails.')
  const { error } = await supabase.rpc('fail_replacement_verification', {
    p_replacement_id: id,
    p_reason: trimmed,
  })
  if (error) throw unwrapRpcError(error, 'record this verification outcome')
  return getReplacement(id)
}

/**
 * replacement_processing -> replacement_shipped. Tracking details are all
 * optional ("if available" per spec) — pass whichever of courier/id/url the
 * admin has, or omit them entirely. Same three field names orders already
 * use for their own shipment tracking (see updateOrderStatus in
 * services/adminOrders.js), stored here on the replacement instead.
 *
 * @param {string} id
 * @param {{ trackingCourier?: string, trackingId?: string, trackingUrl?: string }} [tracking]
 */
export async function shipReplacement(id, tracking = {}) {
  const trackingUrl = (tracking.trackingUrl || '').trim()
  if (trackingUrl && !/^https?:\/\//i.test(trackingUrl)) {
    throw new Error('Tracking link should start with http:// or https://')
  }
  return transitionReplacement(id, 'replacement_processing', {
    status: 'replacement_shipped',
    shipped_at: new Date().toISOString(),
    tracking_courier: (tracking.trackingCourier || '').trim() || null,
    tracking_id: (tracking.trackingId || '').trim() || null,
    tracking_url: trackingUrl || null,
  })
}

/** replacement_shipped -> replacement_completed */
export async function markReplacementDelivered(id) {
  return transitionReplacement(id, 'replacement_shipped', {
    status: 'replacement_completed',
    delivered_at: new Date().toISOString(),
  })
}

/**
 * Saves (or clears, with an empty string) the internal admin note on a
 * replacement. Unlike the status transitions above this isn't guarded by
 * `fromStatus` — a note can be added or edited regardless of where the
 * request currently sits, and it never changes `status`. Requires
 * supabase/part-27-replacements-admin-note.sql to have been run.
 */
export async function updateReplacementAdminNote(id, note) {
  requireSupabase()
  const trimmed = (note || '').trim()
  const { data, error } = await supabase
    .from('replacements')
    .update({ admin_note: trimmed || null })
    .eq('id', id)
    .select(ADMIN_REPLACEMENT_SELECT)
    .maybeSingle()
  if (error) throw new Error(describeSupabaseError(error, 'save this admin note'))
  if (!data) throw new Error('This replacement request no longer exists.')
  return (await mapRows([data]))[0]
}
