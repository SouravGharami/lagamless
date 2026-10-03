import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { loadRazorpayScript } from '../lib/razorpay.js'

/**
 * Checkout / Razorpay orchestration.
 *
 * Nothing here decides prices, order totals, or payment outcomes — those
 * all live in the `create-razorpay-order` / `verify-razorpay-payment` /
 * `razorpay-webhook` edge functions (see supabase/functions/README.md),
 * which run with the service-role key specifically so that trust boundary
 * never has to sit in browser-side JS. This file's job is just: call the
 * functions, open/close the Razorpay modal, and report back what happened.
 */

function requireSupabase() {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see supabase/SETUP.md) before checking out.',
    )
  }
}

/**
 * Creates the pending order + Razorpay order for the given cart/customer.
 * @param {{customer: object, shippingAddress: object, items: Array}} payload - shape from buildCheckoutPayload()
 * @returns {Promise<{orderId: string, razorpayOrderId: string, amount: number, currency: string, keyId: string, prefill: object}>}
 */
export async function createCheckoutOrder(payload) {
  requireSupabase()
  const { customer, shippingAddress, items } = payload
  const { data, error } = await supabase.functions.invoke('create-razorpay-order', {
    body: {
      customer,
      shippingAddress,
      items: items.map((item) => ({
        productId: item.productId,
        size: item.size,
        quantity: item.quantity,
      })),
    },
  })
  if (error) throw await toFunctionError(error)
  if (data?.error) throw new Error(data.error)
  return data
}

/**
 * Asks the backend to confirm a completed Razorpay checkout attempt.
 * @param {{razorpay_order_id: string, razorpay_payment_id: string, razorpay_signature: string}} verification
 * @returns {Promise<{success: boolean, orderId: string, status: string}>}
 */
export async function verifyCheckoutPayment(verification) {
  requireSupabase()
  const { data, error } = await supabase.functions.invoke('verify-razorpay-payment', {
    body: verification,
  })
  if (error) throw await toFunctionError(error)
  if (data?.error) throw new Error(data.error)
  return data
}

/**
 * Fetches an order's current status/summary — used by the Success/Failed
 * pages when they don't already have the summary handed to them via
 * router state (e.g. a refresh).
 * @param {string} orderId
 */
export async function getOrderStatus(orderId) {
  requireSupabase()
  const { data, error } = await supabase.functions.invoke('get-order-status', {
    body: { orderId },
  })
  if (error) throw await toFunctionError(error)
  if (data?.error) throw new Error(data.error)
  return data
}

/**
 * Looks up every order placed under a given email — backs the
 * customer-facing "Track your order" screen at /login. See
 * supabase/functions/get-orders-by-email for the security note on why
 * this is email-only (no password) by design.
 * @param {string} email
 * @returns {Promise<{orders: Array}>}
 */
export async function getOrdersByEmail(email) {
  requireSupabase()
  const { data, error } = await supabase.functions.invoke('get-orders-by-email', {
    body: { email },
  })
  if (error) throw await toFunctionError(error)
  if (data?.error) throw new Error(data.error)
  return data
}

/**
 * Creates a Cash-on-Delivery order — no online payment, so this never
 * touches Razorpay. Calls the `create-cod-order` edge function, which
 * validates the request and then places the order in ONE database transaction
 * (see supabase/part-24-cod-orders.sql): re-prices the cart from the products
 * table, reserves stock, and writes orders/order_items/payments
 * (payments.provider = 'cod'). The server also prices shipping from
 * `deliveryMethod`; a client-sent total is never read.
 *
 * `idempotencyKey` must be the same value for every retry of one checkout
 * attempt — the server then returns the first order instead of creating a
 * second one.
 *
 * @param {{customer: object, shippingAddress: object, items: Array, deliveryMethod?: string}} payload - from buildCheckoutPayload()
 * @param {string} idempotencyKey
 * @returns {Promise<{orderId: string, amount: number, subtotal: number, shipping: number}>}
 */
export async function placeCodOrder(payload, idempotencyKey) {
  requireSupabase()
  const { customer, shippingAddress, items, deliveryMethod } = payload
  const { data, error } = await supabase.functions.invoke('create-cod-order', {
    body: {
      customer,
      shippingAddress,
      deliveryMethod,
      idempotencyKey,
      items: items.map((item) => ({
        productId: item.productId,
        size: item.size,
        quantity: item.quantity,
      })),
    },
  })
  if (error) throw await toFunctionError(error)
  if (data?.error) throw new Error(data.error)
  return data
}

/**
 * Runs the full pay flow: creates the order, opens Razorpay Checkout, and
 * resolves once the customer's attempt is fully settled one way or the
 * other (paid or failed/cancelled) — it never rejects just because the
 * payment failed, only on an operational problem (network, gateway
 * script, etc). Cancelling the modal is treated the same as a failed
 * payment: the order already exists as `pending`/`payment_failed`, so the
 * customer needs a clear next step either way, not a silent return to the
 * form.
 *
 * @param {{customer: object, shippingAddress: object, items: Array}} payload
 * @returns {Promise<{outcome: 'paid'|'failed', orderId: string}>}
 */
export async function payWithRazorpay(payload) {
  const order = await createCheckoutOrder(payload)

  await loadRazorpayScript()

  return new Promise((resolve, reject) => {
    const razorpay = new window.Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: 'LAGAMLESS',
      description: 'Order payment',
      order_id: order.razorpayOrderId,
      prefill: order.prefill,
      theme: { color: '#111111' },
      handler: async (response) => {
        try {
          const result = await verifyCheckoutPayment({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          })
          resolve({ outcome: result.success ? 'paid' : 'failed', orderId: result.orderId })
        } catch (err) {
          reject(err)
        }
      },
      modal: {
        // The customer closed the modal without completing payment. The
        // order/payment rows stay exactly as create-razorpay-order left
        // them (`pending`) — there's nothing to verify, so this doesn't
        // call verify-razorpay-payment. The Failed page's "Try payment
        // again" action re-runs this same flow against a fresh Razorpay
        // order rather than needing this one to be marked failed first.
        ondismiss: () => resolve({ outcome: 'failed', orderId: order.orderId }),
      },
    })

    razorpay.on('payment.failed', () => {
      // Razorpay already reports this to the webhook independently; the
      // modal's own failure event just lets us redirect immediately
      // instead of waiting on that round-trip.
      resolve({ outcome: 'failed', orderId: order.orderId })
    })

    razorpay.open()
  })
}

/**
 * Unwraps a supabase-js FunctionsHttpError into the edge function's own
 * `{ error: "..." }` message, if present. Exported so other service
 * modules calling `supabase.functions.invoke(...)` (e.g. services/returns.js)
 * get the same readable error surfacing this file already relies on,
 * instead of duplicating the try/catch.
 */
export async function toFunctionError(error) {
  // FunctionsFetchError = the request never got a usable HTTP response at all
  // (offline, blocked by CORS, or — most commonly during setup — the edge
  // function simply isn't deployed on this Supabase project, in which case the
  // gateway's 404 carries no CORS headers and the browser reports a bare
  // "Failed to send a request"). Keep the technical hint in the console for
  // developers, and show the customer something they can act on.
  if (error?.name === 'FunctionsFetchError') {
    console.error(
      'Edge function request failed before reaching a response. If this is a new function, make sure it is deployed: `supabase functions deploy <name>`.',
      error,
    )
    return new Error(
      "We couldn't reach the order service just now. Please check your connection and try again in a moment.",
    )
  }
  // supabase-js's FunctionsHttpError wraps the actual response — try to
  // surface the function's own `{ error: "..." }` body instead of a
  // generic "Edge Function returned a non-2xx status code".
  try {
    const body = await error.context.json()
    if (body?.error) return new Error(body.error)
  } catch {
    // fall through to the generic message below
  }
  return new Error(error.message || 'Something went wrong contacting the server.')
}
