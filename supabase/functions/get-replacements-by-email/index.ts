// POST /get-replacements-by-email
//
// Body: { email }
//
// Lists every replacement request raised by the customer with this email, so
// the "Track your order" screen and the signed-in Account page can show each
// replacement's status next to its order (src/components/OrderHistory.jsx).
//
// This is a separate function from get-orders-by-email on purpose: the
// existing orders/returns lookup is left completely untouched, so replacement
// can't affect what the return workflow returns.
//
// SECURITY NOTE — identical trade-off to get-orders-by-email: an email address
// is not a secret, so anyone who knows it can list that customer's replacement
// requests. It exposes only the request's own fields (no address/payment data).
//
// Returns: { replacements: [{ id, orderId, orderItemId, status, reason,
//   customerNote, requestedSize, requestedColor, originalSize, quantity,
//   rejectionReason, requestedAt, approvedAt, returnReceivedAt, verifiedAt,
//   shippedAt, deliveredAt, trackingCourier, trackingId, trackingUrl }]
// newest first.

import { handleOptions, jsonResponse } from '../_shared/cors.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { EMAIL_RE } from '../_shared/replacements.ts'

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

  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  if (!email || !EMAIL_RE.test(email)) {
    return jsonResponse({ error: 'Enter a valid email address.' }, 400)
  }

  const { data, error } = await supabaseAdmin
    .from('replacements')
    .select(
      'id, order_id, order_item_id, status, reason, customer_note, requested_size, requested_color, ' +
        'original_size, quantity, rejection_reason, requested_at, approved_at, return_received_at, ' +
        'verified_at, shipped_at, delivered_at, tracking_courier, tracking_id, tracking_url',
    )
    // Case-insensitive exact match: escape LIKE wildcards so an email
    // containing "_" or "%" can't match other customers' rows.
    .ilike('customer_email', email.replace(/[\\%_]/g, '\\$&'))
    .order('requested_at', { ascending: false })

  if (error) {
    console.error('get-replacements-by-email failed:', error)
    return jsonResponse({ error: 'We could not load your replacement requests right now.' }, 500)
  }

  return jsonResponse({
    replacements: (data || []).map((r: any) => ({
      id: r.id,
      orderId: r.order_id,
      orderItemId: r.order_item_id,
      status: r.status,
      reason: r.reason,
      customerNote: r.customer_note,
      requestedSize: r.requested_size,
      requestedColor: r.requested_color,
      originalSize: r.original_size,
      quantity: r.quantity,
      rejectionReason: r.rejection_reason,
      requestedAt: r.requested_at,
      approvedAt: r.approved_at,
      returnReceivedAt: r.return_received_at,
      verifiedAt: r.verified_at,
      shippedAt: r.shipped_at,
      deliveredAt: r.delivered_at,
      trackingCourier: r.tracking_courier,
      trackingId: r.tracking_id,
      trackingUrl: r.tracking_url,
    })),
  })
})
