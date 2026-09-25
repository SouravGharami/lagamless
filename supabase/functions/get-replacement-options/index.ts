// POST /get-replacement-options
//
// Body: { orderId, email }
//
// Feeds the Replace dialog (src/components/ReplacementRequestDialog.jsx): for
// each item on a DELIVERED order, the sizes (with an in-stock flag) and colors
// of that SAME product a replacement may choose from, plus — when an item
// can't be replaced right now — a customer-facing `blockedReason`.
//
// Read-only. Availability/blocking come from the same helpers
// submit-replacement-request enforces with, so what the dialog offers and what
// the server accepts can't drift apart. Raw stock counts are never returned,
// only a boolean.
//
// Same guest-checkout trust boundary as submit-return-request / get-orders-by-email
// (email must match the order's customer_email).
//
// Returns: { items: [{ orderItemId, productId, productName, size, quantity,
//                       sizes: [{ size, available }], colors: [{ name, hex }],
//                       blockedReason: string | null }] }

import { handleOptions, jsonResponse } from '../_shared/cors.ts'
import { EMAIL_RE, getBlockReason, getOwnedDeliveredOrder, loadProductOptions } from '../_shared/replacements.ts'

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
  if (!orderId) return jsonResponse({ error: 'Missing orderId.' }, 400)
  if (!email || !EMAIL_RE.test(email)) return jsonResponse({ error: 'Enter a valid email address.' }, 400)

  try {
    const owned = await getOwnedDeliveredOrder(orderId, email)
    if ('error' in owned) return jsonResponse({ error: owned.error }, owned.status)
    const { order } = owned

    const items = await Promise.all(
      order.order_items.map(async (item) => {
        const base = {
          orderItemId: item.id,
          productId: item.product_id,
          productName: item.product_name,
          size: item.size,
          quantity: item.quantity,
        }
        if (!item.product_id) {
          return {
            ...base,
            sizes: [],
            colors: [],
            blockedReason: 'This item is no longer linked to a product, so it can’t be replaced online.',
          }
        }
        const blockedReason = await getBlockReason(order.id, item.id)
        const options = await loadProductOptions(item.product_id, item.quantity)
        return {
          ...base,
          sizes: options?.sizes ?? [],
          colors: options?.colors ?? [],
          blockedReason: blockedReason ?? (options ? null : 'This product is no longer available.'),
        }
      }),
    )

    return jsonResponse({ items })
  } catch (err) {
    console.error('get-replacement-options failed:', err)
    return jsonResponse({ error: 'We could not load replacement options right now. Please try again.' }, 500)
  }
})
