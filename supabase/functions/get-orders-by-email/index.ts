// POST /get-orders-by-email
//
// Body: { email }
//
// Backs the customer-facing "Track your order" screen at /login — the
// default entry point for the account icon now that password sign-in has
// moved behind /admin/login (see src/pages/OrderLookup.jsx). Checkout
// never required an account (see create-razorpay-order), so this is the
// only way most customers can ever see their own order history: everyone
// who has ordered has a `customer_email` on their order row (schema.sql),
// signed in or not.
//
// SECURITY NOTE — unlike get-order-status (gated by an unguessable order
// UUID), an email address is not a secret. Anyone who knows a customer's
// email can list their order history, items, and totals through this
// endpoint. That's an intentional trade-off for a low-friction "track my
// order" flow, matching the same guest-checkout model the rest of this
// project already uses — not an oversight. It deliberately still leaves
// out the full shipping address (unlike get-order-status) to limit what a
// guessed email exposes; only the order id, placed-on date, status,
// totals/items, courier tracking info (once shipped), and the full
// return-workflow status (once a return exists) come back. If this needs
// hardening later, add a second factor (e.g. also require the order id)
// or rate-limit by IP/email at the edge-function level.

import { handleOptions, jsonResponse } from '../_shared/cors.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

  const { data: orders, error } = await supabaseAdmin
    .from('orders')
    .select(
      // order_items.id is included so the customer-facing Return form
      // (ReturnRequestDialog.jsx, via submit-return-request) can submit
      // the correct order_item_id for a multi-item order.
      'id, status, subtotal, shipping_total, discount_total, total, created_at, tracking_courier, tracking_id, tracking_url, shipped_at, delivered_at, order_items(id, product_id, product_name, sku, size, quantity, unit_price, line_total)',
    )
    // Case-insensitive — the email people type at checkout vs. here won't
    // always match casing exactly.
    .ilike('customer_email', email)
    .order('created_at', { ascending: false })

  if (error) {
    return jsonResponse({ error: error.message }, 500)
  }

  // Look up every return raised against these orders — any workflow
  // status — so the "Track your order" screen can render the full
  // progress timeline (requested → approved → pickup → received →
  // inspection → refund_pending/refunded, or rejected) instead of just
  // collapsing everything down to "requested" / "refunded" (see
  // src/pages/OrderLookup.jsx / src/components/ReturnTimeline.jsx). A
  // return never regresses to an earlier status (see the admin Returns
  // workflow), so at most one row per order/item is ever "live"; ordering
  // by requested_at descending and keeping only the first row seen per
  // key is a defensive guard against a future resubmission (e.g. after a
  // `rejected` outcome) ever being shadowed by its own older row.
  const orderIds = (orders || []).map((order) => order.id)
  type ReturnInfo = { status: string; refundAmount: number | null; refundedAt: string | null }
  const itemReturnByOrder = new Map<string, Map<string, ReturnInfo>>()
  const orderLevelReturnByOrder = new Map<string, ReturnInfo>()

  if (orderIds.length > 0) {
    const { data: returns, error: returnsError } = await supabaseAdmin
      .from('returns')
      .select('order_id, order_item_id, status, refund_amount, refunded_at, requested_at')
      .in('order_id', orderIds)
      .order('requested_at', { ascending: false })

    if (returnsError) {
      return jsonResponse({ error: returnsError.message }, 500)
    }

    for (const ret of returns || []) {
      const info: ReturnInfo = {
        status: ret.status,
        refundAmount: ret.refund_amount ?? null,
        refundedAt: ret.refunded_at ?? null,
      }
      if (ret.order_item_id) {
        if (!itemReturnByOrder.has(ret.order_id)) itemReturnByOrder.set(ret.order_id, new Map())
        const forOrder = itemReturnByOrder.get(ret.order_id)!
        if (!forOrder.has(ret.order_item_id)) forOrder.set(ret.order_item_id, info)
      } else {
        // A return with no specific item covers the whole order.
        if (!orderLevelReturnByOrder.has(ret.order_id)) orderLevelReturnByOrder.set(ret.order_id, info)
      }
    }
  }

  // Product photo per order item, so the customer can SEE what they ordered /
  // are returning / replacing. product_images rows are public-readable anyway
  // (published products); this just saves the browser a second round trip.
  // Additive: a failed lookup just leaves imageUrl null and the UI falls back
  // to a placeholder tile.
  const productIds = [
    ...new Set(
      (orders || []).flatMap((order) => (order.order_items || []).map((item: any) => item.product_id).filter(Boolean)),
    ),
  ]
  const imageByProduct = new Map<string, string>()
  if (productIds.length > 0) {
    const { data: imageRows } = await supabaseAdmin
      .from('product_images')
      .select('product_id, image_url, storage_path, image_type, sort_order')
      .in('product_id', productIds)
    const rank = (row: any) => (row.image_type === 'main' ? 0 : 1)
    const sorted = [...(imageRows || [])].sort(
      (a: any, b: any) => rank(a) - rank(b) || (a.sort_order ?? 0) - (b.sort_order ?? 0),
    )
    for (const row of sorted) {
      if (imageByProduct.has(row.product_id)) continue
      const url =
        row.image_url ||
        (row.storage_path ? supabaseAdmin.storage.from('product-images').getPublicUrl(row.storage_path).data.publicUrl : null)
      if (url) imageByProduct.set(row.product_id, url)
    }
  }

  // Payment method + state per order so the Orders page can label Cash on
  // Delivery orders correctly and show "payment due" vs "payment received".
  // Rows are newest-first, so the first one seen per order is the latest.
  // Additive; a failed lookup just leaves these null.
  const paymentByOrder = new Map<string, { provider: string | null; status: string | null; paidAt: string | null }>()
  if (orderIds.length > 0) {
    const { data: payments } = await supabaseAdmin
      .from('payments')
      .select('order_id, provider, status, paid_at, created_at')
      .in('order_id', orderIds)
      .order('created_at', { ascending: false })
    for (const pay of payments || []) {
      if (pay.provider && !paymentByOrder.has(pay.order_id)) {
        paymentByOrder.set(pay.order_id, {
          provider: pay.provider,
          status: pay.status ?? null,
          paidAt: pay.paid_at ?? null,
        })
      }
    }
  }

  return jsonResponse({
    orders: (orders || []).map((order) => {
      const orderLevelReturn = orderLevelReturnByOrder.get(order.id) || null
      const itemReturns = itemReturnByOrder.get(order.id)
      return {
        orderId: order.id,
        status: order.status,
        paymentMethod: paymentByOrder.get(order.id)?.provider ?? null,
        paymentStatus: paymentByOrder.get(order.id)?.status ?? null,
        paidAt: paymentByOrder.get(order.id)?.paidAt ?? null,
        subtotal: order.subtotal,
        shippingTotal: order.shipping_total,
        discountTotal: order.discount_total,
        total: order.total,
        createdAt: order.created_at,
        trackingCourier: order.tracking_courier,
        trackingId: order.tracking_id,
        trackingUrl: order.tracking_url,
        shippedAt: order.shipped_at,
        deliveredAt: order.delivered_at,
        items: (order.order_items || []).map((item: any) => {
          // An item-specific return takes priority over an order-level
          // one, same precedence the old boolean fields used.
          const ret = itemReturns?.get(item.id) || orderLevelReturn
          return {
            ...item,
            imageUrl: item.product_id ? imageByProduct.get(item.product_id) ?? null : null,
            returnStatus: ret?.status ?? null,
            // Kept alongside returnStatus for any caller still reading
            // the old booleans — both are now simple derivations of it.
            returnRequested: Boolean(ret),
            returnRefunded: ret?.status === 'refunded',
            refundAmount: ret?.status === 'refunded' ? ret.refundAmount : null,
            refundedAt: ret?.status === 'refunded' ? ret.refundedAt : null,
          }
        }),
      }
    }),
  })
})
