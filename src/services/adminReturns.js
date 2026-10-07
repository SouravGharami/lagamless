import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { toFunctionError } from './checkout.js'
import { ORDER_ITEM_IMAGE_EMBED, pickOrderItemImage } from '../lib/orderItemImage.js'

/**
 * Admin returns service — real Supabase, mirrors src/services/adminOrders.js.
 *
 * `public.returns` was created inert in part-17-returns-table.sql (RLS on,
 * zero policies/grants) and stayed that way through Part 18 (customer
 * submission goes through the service-role `submit-return-request` edge
 * function, which doesn't need a policy). part-19-admin-returns.sql adds
 * the admin RLS policy + table grant this service depends on — run that
 * migration before this page will show anything.
 */

function requireSupabase() {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see supabase/SETUP.md) before using the admin panel.',
    )
  }
}

// Pulls in the parent order (for order id / customer name+email) and the
// specific line item the return is for, if any — `order_item_id` is
// nullable (see part-17-returns-table.sql), so a return can be raised
// against a whole order instead of a single item.
const ADMIN_RETURN_SELECT =
  `*, orders(id, customer_name, customer_email, shipping_address, payments(provider), order_items(id, product_name, size, quantity, ${ORDER_ITEM_IMAGE_EMBED})), order_items(product_name, sku, size, ${ORDER_ITEM_IMAGE_EMBED})`

/** Every value this admin UI writes to `returns.status`. `requested` is the
 * only value the DB defaults to (see part-17's header note on why there's
 * no check constraint yet) — this list is the application-level contract.
 * `inspection` and `refund_pending` were added in Part 22 (see
 * part-22-returns-inspection.sql) for the Return Inspection stage:
 * received -> inspection -> (refund_pending | rejected). `refunded` was
 * added in Part 23 (see part-23-returns-refund.sql) for the actual
 * Razorpay refund: refund_pending -> refunded. */
export const RETURN_STATUSES = [
  'requested',
  'approved',
  'rejected',
  'pickup',
  'received',
  'inspection',
  'refund_pending',
  'refunded',
]

function describeSupabaseError(error, action) {
  console.error(`adminReturns: failed to ${action}.`, error)
  const parts = []
  if (error?.code) parts.push(`[${error.code}]`)
  parts.push(error?.message || String(error))
  if (error?.details) parts.push(`— ${error.details}`)
  if (error?.hint) parts.push(`(hint: ${error.hint})`)
  const detail = parts.join(' ')

  if (error?.code === '42501') {
    return `Could not ${action}: ${detail} — this is a missing table GRANT, not an RLS problem. Run supabase/part-19-admin-returns.sql in the Supabase SQL Editor.`
  }
  return `Could not ${action}: ${detail}`
}

/** Maps a Supabase `returns` row (with joined `orders`/`order_items`) onto a camelCase shape. */
function mapReturn(row) {
  return {
    id: row.id,
    orderId: row.order_id,
    orderItemId: row.order_item_id,
    customerId: row.customer_id,
    customerEmail: row.customer_email,
    customerName: row.orders?.customer_name || null,
    customerPhone: row.orders?.shipping_address?.phone || null,
    // 'cod' if ANY payment on the order was Cash on Delivery. A COD order has no
    // online payment to refund against, so its refund is recorded by hand (see
    // initiateRefund below).
    paymentMethod: (row.orders?.payments || []).some((p) => p.provider === 'cod') ? 'cod' : 'online',
    productName: row.order_items?.product_name || null,
    sku: row.order_items?.sku || null,
    size: row.order_items?.size || null,
    // Photo of the returned item. A whole-order return has no single item, so
    // `orderItems` lists every item on the order (each with its photo) for the UI.
    imageUrl: pickOrderItemImage(row.order_items?.products),
    orderItems: (row.orders?.order_items || []).map((item) => ({
      id: item.id,
      productName: item.product_name,
      size: item.size,
      quantity: item.quantity,
      imageUrl: pickOrderItemImage(item.products),
    })),
    reason: row.reason,
    customerNote: row.customer_note || null,
    status: row.status,
    rejectionReason: row.rejection_reason || null,
    requestedAt: row.requested_at,
    receivedAt: row.received_at || null,
    inspectionStartedAt: row.inspection_started_at || null,
    refundId: row.refund_id || null,
    refundAmount: row.refund_amount ?? null,
    // Distinct from `status`: `status` only reaches 'refunded' once a
    // refund actually completes. `refundStatus` additionally tracks
    // 'processing' (an attempt is currently in flight at Razorpay) and
    // 'failed' (the most recent attempt didn't succeed, while `status`
    // stays 'refund_pending' so the admin can retry) — see Part 23
    // (part-23-returns-refund.sql) and initiate-return-refund/index.ts.
    refundStatus: row.refund_status || null,
    refundFailureReason: row.refund_failure_reason || null,
    refundInitiatedAt: row.refund_initiated_at || null,
    refundedAt: row.refunded_at || null,
    updatedAt: row.updated_at,
  }
}

/**
 * @returns {Promise<Array<ReturnType<typeof mapReturn>>>}
 */
export async function getReturns() {
  requireSupabase()
  const { data, error } = await supabase
    .from('returns')
    .select(ADMIN_RETURN_SELECT)
    .order('requested_at', { ascending: false })
  if (error) throw new Error(describeSupabaseError(error, 'load returns'))
  return (data || []).map(mapReturn)
}

/**
 * Shared guarded-write path for every return status transition below
 * (approve/reject/start pickup). Requires the signed-in user to be an
 * admin — enforced by the "Admins can manage returns" RLS policy
 * (part-19-admin-returns.sql). A non-admin caller gets 0 rows affected
 * rather than an error (RLS silently filters), surfaced here as a thrown
 * error so the UI doesn't say "saved" when nothing changed.
 *
 * The `.eq('status', fromStatus)` guard is what actually prevents a
 * transition from being applied twice, out of order, or from the wrong
 * starting state (e.g. starting pickup on a return that was actually
 * rejected, or approving one that's already moved on) — it's enforced
 * here at the write itself, not just by the UI hiding the relevant
 * button once `status` has moved on. A return that isn't currently
 * `fromStatus` matches zero rows and comes back as the same "0 rows
 * matched" error as an admin-permission failure, which callers should
 * treat as "someone already changed this one" and refresh.
 *
 * @param {string} id
 * @param {string} fromStatus - the only current status this transition is allowed from
 * @param {{ status: string, rejection_reason?: string | null, received_at?: string }} patch
 * @returns {Promise<ReturnType<typeof mapReturn>>}
 */
async function transitionReturn(id, fromStatus, patch) {
  requireSupabase()
  if (!RETURN_STATUSES.includes(patch.status)) {
    throw new Error(`"${patch.status}" is not a valid return status.`)
  }
  const { data, error } = await supabase
    .from('returns')
    .update(patch)
    .eq('id', id)
    .eq('status', fromStatus)
    .select(ADMIN_RETURN_SELECT)
    .maybeSingle()
  if (error) throw new Error(describeSupabaseError(error, `mark this return as ${patch.status}`))
  if (!data) {
    throw new Error(
      `Return status wasn't updated — 0 rows matched. Either this return is no longer "${fromStatus}" (refresh to see its current status), your account isn't signed in as an admin (profiles.role must be 'admin' for this user), or the return id no longer exists.`,
    )
  }
  return mapReturn(data)
}

/**
 * Approves a return request. Only succeeds while the return is still
 * 'requested' — see transitionReturn()'s guard above.
 *
 * @param {string} id
 * @returns {Promise<ReturnType<typeof mapReturn>>}
 */
export async function approveReturn(id) {
  return transitionReturn(id, 'requested', { status: 'approved' })
}

/**
 * Rejects a return request, saving the admin's reason to
 * `returns.rejection_reason` (see part-20-returns-rejection-reason.sql)
 * in the same update. Only succeeds while the return is still
 * 'requested' — see transitionReturn()'s guard above.
 *
 * @param {string} id
 * @param {string} reason - required, non-empty (trimmed)
 * @returns {Promise<ReturnType<typeof mapReturn>>}
 */
export async function rejectReturn(id, reason) {
  const trimmed = (reason || '').trim()
  if (!trimmed) {
    throw new Error('A rejection reason is required.')
  }
  return transitionReturn(id, 'requested', { status: 'rejected', rejection_reason: trimmed })
}

/**
 * Starts the return pickup stage — moves `status` from 'approved' to
 * 'pickup'. This is deliberately the only thing it does: no courier API
 * call, no pickup date/tracking fields (there's nowhere to put them —
 * `public.returns` gained no new columns for this step), no product-
 * received/inspection/refund logic. Only succeeds while the return is
 * still 'approved' — see transitionReturn()'s guard above, which is what
 * stops pickup from being started on a 'requested', 'rejected', or
 * already-'pickup' return.
 *
 * @param {string} id
 * @returns {Promise<ReturnType<typeof mapReturn>>}
 */
export async function startReturnPickup(id) {
  return transitionReturn(id, 'approved', { status: 'pickup' })
}

/**
 * Marks a return as received — moves `status` from 'pickup' to
 * 'received' and stamps `returns.received_at` (see
 * part-21-returns-received-at.sql) in the same update. This is
 * deliberately the only thing it does: no inspection outcome, no refund,
 * no Razorpay refund call. Only succeeds while the return is still
 * 'pickup' — see transitionReturn()'s guard above, which is what stops
 * this from being triggered on a 'requested', 'approved', 'rejected', or
 * already-'received' return.
 *
 * @param {string} id
 * @returns {Promise<ReturnType<typeof mapReturn>>}
 */
export async function markReturnReceived(id) {
  return transitionReturn(id, 'pickup', { status: 'received', received_at: new Date().toISOString() })
}

/**
 * Starts the Return Inspection stage — moves `status` from 'received' to
 * 'inspection' and stamps `returns.inspection_started_at` (see
 * part-22-returns-inspection.sql) in the same update. This is
 * deliberately the only thing it does: no inspection outcome is recorded
 * yet (see passInspection / failInspection below), no refund, no
 * Razorpay refund call. Only succeeds while the return is still
 * 'received' — see transitionReturn()'s guard above, which is what stops
 * inspection from being started on a return that hasn't been received,
 * or one that's already in/past inspection.
 *
 * @param {string} id
 * @returns {Promise<ReturnType<typeof mapReturn>>}
 */
export async function startInspection(id) {
  return transitionReturn(id, 'received', {
    status: 'inspection',
    inspection_started_at: new Date().toISOString(),
  })
}

/**
 * Records a passed inspection — moves `status` from 'inspection' to
 * 'refund_pending'. This is deliberately the only thing it does: it does
 * NOT trigger a refund or call Razorpay — that stage stops here until a
 * later step implements the actual refund. Only succeeds while the
 * return is still 'inspection' — see transitionReturn()'s guard above.
 *
 * @param {string} id
 * @returns {Promise<ReturnType<typeof mapReturn>>}
 */
export async function passInspection(id) {
  return transitionReturn(id, 'inspection', { status: 'refund_pending' })
}

/**
 * Records a failed inspection — moves `status` from 'inspection' to
 * 'rejected', saving the admin's reason to the same
 * `returns.rejection_reason` column a Part 19 "Reject" decision at the
 * `requested` stage already uses (see part-22-returns-inspection.sql's
 * header note on why no new column was needed for this). Only succeeds
 * while the return is still 'inspection' — see transitionReturn()'s
 * guard above.
 *
 * @param {string} id
 * @param {string} reason - required, non-empty (trimmed)
 * @returns {Promise<ReturnType<typeof mapReturn>>}
 */
export async function failInspection(id, reason) {
  const trimmed = (reason || '').trim()
  if (!trimmed) {
    throw new Error('An inspection failure reason is required.')
  }
  return transitionReturn(id, 'inspection', { status: 'rejected', rejection_reason: trimmed })
}

/**
 * Initiates the actual Razorpay refund for a return that is
 * 'refund_pending' — the terminal state a passed inspection leaves a
 * return in (see passInspection() above). Unlike every other transition
 * in this file, this does NOT write to `public.returns` directly from
 * the browser: it calls the `initiate-return-refund` edge function (see
 * supabase/functions/initiate-return-refund/index.ts and
 * part-23-returns-refund.sql), because only that service-role
 * environment may hold RAZORPAY_KEY_SECRET and actually call Razorpay's
 * Refund API — this function, and this whole file, never sees that
 * secret. The edge function re-checks the return is still
 * 'refund_pending', re-verifies the payment with Razorpay itself before
 * refunding, and guards against a duplicate refund server-side (see that
 * function's header note) — none of that is re-implemented here.
 *
 * On success, the edge function has already moved `status` to
 * 'refunded' and saved `refund_id`/`refund_amount`/`refunded_at`, but it
 * only returns the bare `returns` row (no `orders`/`order_items` join,
 * since it has no reason to select them). This re-selects the row
 * through the same `ADMIN_RETURN_SELECT` shape every other row on this
 * page already uses — via the signed-in admin's own session, under the
 * "Admins can manage returns" RLS policy (part-19-admin-returns.sql),
 * the same read path getReturns() uses — so the table keeps showing
 * customer/product/size for this row instead of those columns going
 * blank after a refund.
 *
 * @param {string} id
 * @param {string} [manualReference] - COD orders only: UPI/bank transfer reference
 * @returns {Promise<ReturnType<typeof mapReturn>>}
 */
export async function initiateRefund(id, manualReference) {
  requireSupabase()
  // `manualReference` is only used for Cash on Delivery orders: the UPI/bank
  // transfer reference of the refund the store sent by hand. Online (Razorpay)
  // orders ignore it — the edge function refunds those through Razorpay itself.
  const { data, error } = await supabase.functions.invoke('initiate-return-refund', {
    body: { returnId: id, ...(manualReference ? { manualReference } : {}) },
  })
  if (error) throw await toFunctionError(error)
  if (data?.error) throw new Error(data.error)

  const { data: row, error: reselectError } = await supabase
    .from('returns')
    .select(ADMIN_RETURN_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (reselectError || !row) {
    throw new Error(
      reselectError
        ? describeSupabaseError(reselectError, 'reload this return after refunding')
        : 'The refund went through, but this return could not be reloaded — refresh the page to see its updated status.',
    )
  }
  return mapReturn(row)
}
