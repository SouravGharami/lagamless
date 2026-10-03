// POST /create-razorpay-order
//
// Body: {
//   customer: { firstName, lastName, email, phone },
//   shippingAddress: { addressLine1, addressLine2, city, state, postalCode, country },
//   items: [{ productId, size, quantity }],
// }
//
// This is the ONLY place order pricing is decided. It never trusts a price,
// name, or line total the client sends — every item is re-priced from the
// `products`/`product_variants` tables (anon-key read, same "published
// only" rows the storefront itself reads; the code below still explicitly
// rejects any line whose product isn't `status === 'published'`, so an
// unpublished/removed product can't be priced through checkout). Anything a
// client-supplied price could tamper with (subtotal, total, line totals) is
// recomputed here from scratch. Writing the resulting order/order_items/
// payments rows below is what actually needs the service-role client —
// those tables have no client-facing RLS policy at all.
//
// Returns: { orderId, razorpayOrderId, amount (paise), currency, keyId,
//            prefill: { name, email, contact } }
// so the frontend can hand `amount`/`razorpayOrderId`/`keyId` straight to
// Razorpay Checkout.js.

import { handleOptions, jsonResponse } from '../_shared/cors.ts'
import { getUserIdFromRequest, supabaseAdmin, supabasePublic } from '../_shared/supabaseAdmin.ts'
import { createRazorpayOrder, getRazorpayKeyId } from '../_shared/razorpay.ts'

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

  const { customer, shippingAddress, items } = body ?? {}

  const validationError = validateInput(customer, shippingAddress, items)
  if (validationError) {
    return jsonResponse({ error: validationError }, 400)
  }

  // --- Re-price every line from the database -------------------------------
  // Read via the anon-key client, not supabaseAdmin: `products` and
  // `product_variants` already have a public "published rows only" RLS
  // policy (schema.sql), so this is the exact same data the storefront
  // itself reads — it doesn't need the service-role bypass. Every item is
  // still independently checked for `status === 'published'` below, so an
  // unpublished/mismatched product is rejected the same way either client
  // would have handled it.
  //
  // `product_variants` is fetched *nested inside* the `products` select —
  // the same embed shape src/services/products.js uses for the Shop/Product
  // pages — rather than as its own top-level `.from('product_variants')`
  // query. The storefront's embedded reads already work for anonymous
  // visitors; querying the same table directly at the top level does not
  // (a table-level grant gap on `product_variants` on its own, separate
  // from the `products` grant). Embedding sidesteps that gap entirely
  // instead of requiring any database change.
  const productIds = [...new Set(items.map((i: any) => i.productId))]
  const { data: products, error: productsError } = await supabasePublic
    .from('products')
    .select('id, product_number, sku, name, price, status, product_variants(id, product_id, size, stock)')
    .in('id', productIds)

  if (productsError) {
    return jsonResponse({ error: `Could not load products: ${productsError.message}` }, 500)
  }

  const productsById = new Map((products ?? []).map((p) => [p.id, p]))

  const variantByKey = new Map(
    (products ?? []).flatMap((p) => (p.product_variants ?? []).map((v: any) => [`${p.id}__${v.size}`, v])),
  )

  const orderItems: Array<{
    product_id: string
    variant_id: string | null
    product_name: string
    sku: string | null
    size: string
    quantity: number
    unit_price: number
    line_total: number
  }> = []

  for (const item of items) {
    const product = productsById.get(item.productId)
    if (!product || product.status !== 'published') {
      return jsonResponse({ error: `Product ${item.productId} is not available.` }, 400)
    }
    const variant = variantByKey.get(`${item.productId}__${item.size}`)
    if (!variant) {
      return jsonResponse({ error: `${product.name}: size ${item.size} is not available.` }, 400)
    }
    if (variant.stock < item.quantity) {
      return jsonResponse(
        { error: `${product.name} (size ${item.size}): only ${variant.stock} left in stock.` },
        409,
      )
    }
    const unitPrice = Number(product.price)
    orderItems.push({
      product_id: product.id,
      variant_id: variant.id,
      product_name: product.name,
      sku: product.sku,
      size: item.size,
      quantity: item.quantity,
      unit_price: unitPrice,
      line_total: Number((unitPrice * item.quantity).toFixed(2)),
    })
  }

  const subtotal = Number(orderItems.reduce((sum, li) => sum + li.line_total, 0).toFixed(2))
  // Shipping/discount aren't wired up yet anywhere in the app (see
  // Checkout.jsx's "To be calculated" copy) — total is the subtotal until
  // that lands. Recorded as 0 rather than null so downstream arithmetic
  // (Razorpay amount, admin totals) never has to special-case null.
  const shippingTotal = 0
  const discountTotal = 0
  const total = Number((subtotal + shippingTotal - discountTotal).toFixed(2))

  if (total <= 0) {
    return jsonResponse({ error: 'Order total must be greater than zero.' }, 400)
  }

  const customerId = await getUserIdFromRequest(req)
  const customerName = `${customer.firstName.trim()} ${customer.lastName.trim()}`.trim()

  // --- Create the order (pending) + its line items --------------------------
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .insert({
      customer_id: customerId,
      customer_email: customer.email.trim(),
      customer_name: customerName,
      status: 'pending',
      subtotal,
      shipping_total: shippingTotal,
      discount_total: discountTotal,
      total,
      shipping_address: {
        ...shippingAddress,
        phone: customer.phone.trim(),
      },
    })
    .select('id')
    .single()

  if (orderError || !order) {
    return jsonResponse({ error: `Could not create order: ${orderError?.message}` }, 500)
  }

  const { error: itemsError } = await supabaseAdmin
    .from('order_items')
    .insert(orderItems.map((li) => ({ ...li, order_id: order.id })))

  if (itemsError) {
    // Best-effort cleanup so a failed line-item insert doesn't leave an
    // empty, confusing "pending" order with no items behind.
    await supabaseAdmin.from('orders').delete().eq('id', order.id)
    return jsonResponse({ error: `Could not create order items: ${itemsError.message}` }, 500)
  }

  // --- Create the Razorpay order --------------------------------------------
  const amountPaise = Math.round(total * 100)
  let razorpayOrder
  try {
    razorpayOrder = await createRazorpayOrder({
      amountPaise,
      receipt: order.id,
      notes: { order_id: order.id },
    })
  } catch (err) {
    await supabaseAdmin.from('orders').update({ status: 'payment_failed' }).eq('id', order.id)
    return jsonResponse({ error: `Could not start payment: ${(err as Error).message}` }, 502)
  }

  const { error: paymentError } = await supabaseAdmin.from('payments').insert({
    order_id: order.id,
    provider: 'razorpay',
    razorpay_order_id: razorpayOrder.id,
    provider_reference: razorpayOrder.id,
    status: 'pending',
    amount: total,
  })

  if (paymentError) {
    return jsonResponse({ error: `Could not record payment: ${paymentError.message}` }, 500)
  }

  return jsonResponse({
    orderId: order.id,
    razorpayOrderId: razorpayOrder.id,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    keyId: getRazorpayKeyId(),
    prefill: {
      name: customerName,
      email: customer.email.trim(),
      contact: customer.phone.trim(),
    },
  })
})

function validateInput(customer: any, shippingAddress: any, items: any): string | null {
  if (!customer || typeof customer !== 'object') return 'Missing customer details.'
  for (const field of ['firstName', 'lastName', 'email', 'phone']) {
    if (!customer[field] || typeof customer[field] !== 'string' || !customer[field].trim()) {
      return `Missing customer field: ${field}.`
    }
  }
  if (!shippingAddress || typeof shippingAddress !== 'object') return 'Missing shipping address.'
  for (const field of ['addressLine1', 'city', 'state', 'postalCode', 'country']) {
    if (!shippingAddress[field] || typeof shippingAddress[field] !== 'string' || !shippingAddress[field].trim()) {
      return `Missing shipping address field: ${field}.`
    }
  }
  if (!Array.isArray(items) || items.length === 0) return 'Cart is empty.'
  for (const item of items) {
    if (!item.productId || !item.size || !Number.isInteger(item.quantity) || item.quantity <= 0) {
      return 'Invalid cart line.'
    }
  }
  return null
}
