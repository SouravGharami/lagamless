// POST /get-order-status
//
// Body: { orderId }
//
// Backs the Order Success / Order Failed pages. The Checkout page already
// has the full order summary in memory right after payment and passes it
// via router state, so this endpoint only matters when that state is
// missing — a page refresh, a bookmarked/shared link, or the customer
// hitting back/forward.
//
// No RLS-based access control gates this: it's reachable by anyone who has
// the order's UUID. That's an intentional, common trade-off for guest
// checkout confirmation pages (a v4 UUID is not guessable), not an
// oversight — see supabase/functions/README.md. It deliberately returns
// only what a confirmation page needs (status, items, totals, the
// destination address) and never anything from `payments` beyond a status
// string (no gateway ids, no raw provider payloads).

import { handleOptions, jsonResponse } from '../_shared/cors.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'

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

  const orderId = body?.orderId
  if (!orderId || typeof orderId !== 'string') {
    return jsonResponse({ error: 'Missing orderId.' }, 400)
  }

  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select(
      'id, status, subtotal, shipping_total, discount_total, total, shipping_address, created_at, tracking_courier, tracking_id, tracking_url, shipped_at, delivered_at, order_items(product_name, sku, size, quantity, unit_price, line_total)',
    )
    .eq('id', orderId)
    .maybeSingle()

  if (error) {
    return jsonResponse({ error: error.message }, 500)
  }
  if (!order) {
    return jsonResponse({ error: 'Order not found.' }, 404)
  }

  // Which payment method this order used ('razorpay' | 'cod'), so the Order
  // Success page can render the Cash on Delivery variant. Additive only —
  // a lookup failure just leaves these null and never fails the request.
  const { data: payment } = await supabaseAdmin
    .from('payments')
    .select('provider, status, paid_at')
    .eq('order_id', order.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return jsonResponse({
    orderId: order.id,
    status: order.status,
    paymentMethod: payment?.provider ?? null,
    paymentStatus: payment?.status ?? null,
    paidAt: payment?.paid_at ?? null,
    subtotal: order.subtotal,
    shippingTotal: order.shipping_total,
    discountTotal: order.discount_total,
    total: order.total,
    shippingAddress: order.shipping_address,
    createdAt: order.created_at,
    trackingCourier: order.tracking_courier,
    trackingId: order.tracking_id,
    trackingUrl: order.tracking_url,
    shippedAt: order.shipped_at,
    deliveredAt: order.delivered_at,
    items: order.order_items,
  })
})
