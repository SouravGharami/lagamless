// POST /create-cod-order
//
// Body: {
//   customer: { firstName, lastName, email, phone },
//   shippingAddress: { addressLine1, addressLine2, city, state, postalCode, country },
//   items: [{ productId, size, quantity }],
//   deliveryMethod?: 'standard' | 'express',
//   idempotencyKey?: string,   // one per checkout attempt — makes retries safe
// }
//
// The Cash-on-Delivery counterpart to `create-razorpay-order`. No money moves
// online, so this never talks to Razorpay.
//
// This function only VALIDATES and PRICES SHIPPING; everything that must be
// all-or-nothing happens inside the `place_cod_order` Postgres function (see
// supabase/part-24-cod-orders.sql), in a single transaction:
//   - re-prices every line from the `products` table (a client-sent price or
//     total is never read),
//   - locks the stock rows, checks availability, and RESERVES the stock,
//   - writes orders + order_items + payments (provider 'cod', status 'pending').
// Because it's one transaction, two customers can never buy the last item, and
// a failure part-way never leaves a half-created order behind.
//
// `orders.status` stays `pending` for a COD order — it means "placed, awaiting
// confirmation / delivery", not "payment pending". The admin confirms and ships
// it; once it's marked delivered, a database trigger marks the COD payment
// `paid` (cash collected). Cancelling it gives the stock back.
//
// Optional settings (Supabase secrets — all optional):
//   COD_MAX_ORDER_TOTAL        e.g. 10000  — refuse COD above this order total
//   COD_MAX_OPEN_PER_CONTACT   default 5   — max unconfirmed COD orders per
//                                            phone/email in 24h (fake-order guard)
//
// Returns: { orderId, amount, subtotal, shipping } — amounts in rupees.

import { handleOptions, jsonResponse } from '../_shared/cors.ts'
import { getUserIdFromRequest, supabaseAdmin } from '../_shared/supabaseAdmin.ts'

// Must match DELIVERY_OPTIONS in src/pages/Checkout.jsx.
const SHIPPING_FEES: Record<string, number> = { standard: 0, express: 99 }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const INDIAN_PHONE_RE = /^(?:\+?91[\s-]?)?[6-9]\d{9}$/
const INDIAN_PIN_RE = /^[1-9]\d{5}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// place_cod_order raises 'CODE|message' — map each code to an HTTP status.
const ERROR_STATUS: Record<string, number> = {
  ITEM_UNAVAILABLE: 400,
  OUT_OF_STOCK: 409,
  COD_LIMIT: 400,
  TOO_MANY_ORDERS: 429,
  INVALID_TOTAL: 400,
}

function envNumber(name: string): number | null {
  const raw = Deno.env.get(name)
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

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
  const deliveryMethod = body?.deliveryMethod ?? 'standard'
  const idempotencyKey = typeof body?.idempotencyKey === 'string' ? body.idempotencyKey.trim().slice(0, 100) : null

  const validationError = validateInput(customer, shippingAddress, items, deliveryMethod)
  if (validationError) {
    return jsonResponse({ error: validationError }, 400)
  }

  const customerId = await getUserIdFromRequest(req)

  const { data, error } = await supabaseAdmin.rpc('place_cod_order', {
    p_customer: {
      firstName: customer.firstName.trim(),
      lastName: customer.lastName.trim(),
      email: customer.email.trim(),
      phone: customer.phone.replace(/[\s-]/g, ''),
    },
    p_address: {
      addressLine1: shippingAddress.addressLine1.trim(),
      addressLine2: (shippingAddress.addressLine2 ?? '').trim(),
      city: shippingAddress.city.trim(),
      state: shippingAddress.state.trim(),
      postalCode: shippingAddress.postalCode.trim(),
      country: shippingAddress.country.trim(),
    },
    p_items: items.map((i: any) => ({ productId: i.productId, size: i.size, quantity: i.quantity })),
    p_customer_id: customerId,
    p_shipping: SHIPPING_FEES[deliveryMethod],
    p_delivery_method: deliveryMethod,
    p_idempotency_key: idempotencyKey || null,
    p_max_total: envNumber('COD_MAX_ORDER_TOTAL'),
    p_max_open_orders: envNumber('COD_MAX_OPEN_PER_CONTACT') ?? 5,
  })

  if (error) {
    // Our own business-rule errors look like 'CODE|message'.
    const [code, ...rest] = (error.message ?? '').split('|')
    if (rest.length > 0 && code in ERROR_STATUS) {
      return jsonResponse({ error: rest.join('|').trim() }, ERROR_STATUS[code])
    }
    // Anything else is unexpected — log the detail, show the customer something safe.
    console.error('place_cod_order failed:', error)
    return jsonResponse({ error: 'We could not place your order right now. Please try again.' }, 500)
  }

  return jsonResponse({
    orderId: data.orderId,
    amount: Number(data.total),
    subtotal: Number(data.subtotal),
    shipping: Number(data.shipping),
  })
})

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function validateInput(customer: any, shippingAddress: any, items: any, deliveryMethod: any): string | null {
  if (!customer || typeof customer !== 'object') return 'Missing customer details.'
  for (const field of ['firstName', 'lastName', 'email', 'phone']) {
    if (!isText(customer[field])) return `Missing customer field: ${field}.`
  }
  if (!EMAIL_RE.test(customer.email.trim())) return 'Enter a valid email address.'
  if (!INDIAN_PHONE_RE.test(customer.phone.replace(/[\s-]/g, ''))) {
    return 'Enter a valid 10-digit Indian mobile number.'
  }

  if (!shippingAddress || typeof shippingAddress !== 'object') return 'Missing shipping address.'
  for (const field of ['addressLine1', 'city', 'state', 'postalCode', 'country']) {
    if (!isText(shippingAddress[field])) return `Missing shipping address field: ${field}.`
  }
  if (!INDIAN_PIN_RE.test(shippingAddress.postalCode.trim())) return 'Enter a valid 6-digit PIN code.'

  if (!(deliveryMethod in SHIPPING_FEES)) return 'Invalid delivery method.'

  if (!Array.isArray(items) || items.length === 0) return 'Cart is empty.'
  if (items.length > 20) return 'Too many items in one order.'
  for (const item of items) {
    if (!item || !isText(item.productId) || !UUID_RE.test(item.productId) || !isText(item.size)) {
      return 'Invalid cart line.'
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 10) return 'Invalid cart line.'
  }
  return null
}
