// POST /submit-return-request
//
// Body: { orderId, email, reason, note, orderItemId }
//
// Backs the "Submit return request" button in
// src/components/ReturnRequestDialog.jsx, opened from a delivered order's
// "Return" button on the customer-facing /login → OrderLookup.jsx screen.
// Writes to `public.returns` (see supabase/part-17-returns-table.sql),
// which has RLS enabled with zero policies — same as orders/order_items
// before Part 10 — so this is the *only* code path allowed to write to
// it, exactly like create-razorpay-order/verify-razorpay-payment are for
// orders. See supabase/part-18-returns-submit.sql and
// supabase/functions/README.md.
//
// SECURITY NOTE — this project's guest-checkout model has no password for
// most customers (see get-orders-by-email's own note on the same
// trade-off): "the order belongs to the customer" is checked the only way
// this app can check it today, by matching the email the customer typed
// against orders.customer_email, case-insensitively. That is not a secret
// the way a session token is, but it's the same trust boundary the
// "Track your order" screen this form is reached from already relies on.
//
// Returns: { success: true, returnId } on success, { error } otherwise.

import { handleOptions, jsonResponse } from '../_shared/cors.ts'
import { getUserIdFromRequest, supabaseAdmin } from '../_shared/supabaseAdmin.ts'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Mirrors RETURN_REASONS in src/components/ReturnRequestDialog.jsx and the
// `reason` check constraint on public.returns (part-17-returns-table.sql).
// Kept in sync by hand — Deno edge functions don't share a module graph
// with the Vite frontend, so this can't just be imported.
const RETURN_REASONS = [
  "Size doesn't fit",
  'Wrong product received',
  'Damaged product',
  'Defective product',
  'Different from description',
  'Other',
]

const MAX_NOTE_LENGTH = 500

/** Return window: exactly 7 days from delivered_at — same rule as the
 * frontend's isReturnEligible() in src/pages/OrderLookup.jsx, enforced
 * again here since client-side validation alone can't be trusted. */
const RETURN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : ''
  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, MAX_NOTE_LENGTH) : ''
  const orderItemId = typeof body?.orderItemId === 'string' && body.orderItemId ? body.orderItemId : null

  if (!orderId) {
    return jsonResponse({ error: 'Missing orderId.' }, 400)
  }
  if (!email || !EMAIL_RE.test(email)) {
    return jsonResponse({ error: 'Enter a valid email address.' }, 400)
  }
  if (!RETURN_REASONS.includes(reason)) {
    return jsonResponse({ error: 'Select a valid reason for your return.' }, 400)
  }

  // --- Load the order + its items, so every check below runs against the
  // database's own record, not whatever the client happened to send. -----
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, status, customer_email, delivered_at, order_items(id)')
    .eq('id', orderId)
    .maybeSingle()

  if (orderError) {
    return jsonResponse({ error: orderError.message }, 500)
  }
  if (!order) {
    return jsonResponse({ error: 'Order not found.' }, 404)
  }

  // The order belongs to the customer.
  if (!order.customer_email || order.customer_email.toLowerCase() !== email.toLowerCase()) {
    return jsonResponse({ error: 'We could not match that order to this email address.' }, 403)
  }

  // The order status is 'delivered'.
  if (order.status !== 'delivered') {
    return jsonResponse({ error: 'This order is not eligible for a return yet.' }, 400)
  }

  // delivered_at exists.
  if (!order.delivered_at) {
    return jsonResponse({ error: 'This order has no delivery date on file, so it cannot be returned yet.' }, 400)
  }

  // The order is still within the 7-day return period.
  const deliveredAtMs = new Date(order.delivered_at).getTime()
  if (Number.isNaN(deliveredAtMs) || Date.now() - deliveredAtMs > RETURN_WINDOW_MS) {
    return jsonResponse({ error: 'The 7-day return window for this order has passed.' }, 400)
  }

  // order_item_id, if given, must actually belong to this order.
  const orderItemIds = new Set((order.order_items ?? []).map((item: any) => item.id))
  if (orderItemId && !orderItemIds.has(orderItemId)) {
    return jsonResponse({ error: 'That item does not belong to this order.' }, 400)
  }

  // A return request does not already exist for the same order item
  // (or, for a whole-order return with no item selected, for the order
  // itself). Scoped to `requested` explicitly — the only status that
  // exists today (see part-17-returns-table.sql), but explicit so a
  // future rejected/cancelled return doesn't block a resubmission once
  // admin workflow states exist.
  let existingQuery = supabaseAdmin.from('returns').select('id').eq('order_id', orderId).eq('status', 'requested')
  existingQuery = orderItemId ? existingQuery.eq('order_item_id', orderItemId) : existingQuery.is('order_item_id', null)
  const { data: existing, error: existingError } = await existingQuery.maybeSingle()

  if (existingError) {
    return jsonResponse({ error: existingError.message }, 500)
  }
  if (existing) {
    return jsonResponse({ error: 'A return request already exists for this item.' }, 409)
  }

  const customerId = await getUserIdFromRequest(req)

  const { data: created, error: insertError } = await supabaseAdmin
    .from('returns')
    .insert({
      order_id: orderId,
      order_item_id: orderItemId,
      customer_id: customerId,
      customer_email: order.customer_email,
      reason,
      customer_note: note || null,
      status: 'requested',
    })
    .select('id')
    .single()

  if (insertError || !created) {
    return jsonResponse({ error: `Could not submit return request: ${insertError?.message}` }, 500)
  }

  return jsonResponse({ success: true, returnId: created.id })
})
