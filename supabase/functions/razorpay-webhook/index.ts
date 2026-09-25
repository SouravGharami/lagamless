// POST /razorpay-webhook
//
// This is the AUTHORITATIVE record of a payment's outcome — configure it
// in the Razorpay Dashboard under Settings → Webhooks, pointing at this
// function's URL, subscribed to at least `payment.captured` and
// `payment.failed`. Unlike verify-razorpay-payment (called by the
// customer's own browser, which they could in principle close, lose
// connection, or tamper with), Razorpay calls this server-to-server and
// retries on failure, so it is what an order/payment status should be
// trusted from if the two ever disagreed. Both handlers write through the
// same idempotent upsert keyed on razorpay_order_id, so processing the
// same event twice (Razorpay's retry policy expects you to handle that) is
// a no-op the second time.
//
// IMPORTANT: signature verification needs the *raw* request body bytes —
// re-serializing a parsed JSON object before hashing it would very likely
// produce a different byte sequence than what Razorpay signed, and the
// check would always fail. Read `req.text()` first, verify, THEN parse.

import { handleOptions, jsonResponse } from '../_shared/cors.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { verifyWebhookSignature } from '../_shared/razorpay.ts'

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const signatureHeader = req.headers.get('x-razorpay-signature')
  const rawBody = await req.text()

  if (!signatureHeader) {
    return jsonResponse({ error: 'Missing x-razorpay-signature header.' }, 400)
  }

  let signatureValid: boolean
  try {
    signatureValid = await verifyWebhookSignature(rawBody, signatureHeader)
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500)
  }

  if (!signatureValid) {
    return jsonResponse({ error: 'Invalid webhook signature.' }, 400)
  }

  let event: any
  try {
    event = JSON.parse(rawBody)
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400)
  }

  const eventType = event?.event
  const paymentEntity = event?.payload?.payment?.entity

  // Events this app doesn't act on (refunds, disputes, etc.) are
  // acknowledged with 200 rather than an error — an unhandled event is not
  // a failure, and returning non-200 would make Razorpay retry it forever.
  if (!paymentEntity || (eventType !== 'payment.captured' && eventType !== 'payment.failed')) {
    return jsonResponse({ received: true, handled: false })
  }

  const razorpayOrderId = paymentEntity.order_id as string
  const razorpayPaymentId = paymentEntity.id as string

  const { data: payment, error: lookupError } = await supabaseAdmin
    .from('payments')
    .select('id, order_id, status')
    .eq('razorpay_order_id', razorpayOrderId)
    .maybeSingle()

  if (lookupError || !payment) {
    // No matching order — most likely a payment created outside this app,
    // or the create-order call's DB insert hasn't committed yet under a
    // very unlucky race. Acknowledge so Razorpay doesn't retry forever;
    // there's nothing more this handler can do without an order to update.
    return jsonResponse({ received: true, handled: false, reason: 'No matching order.' })
  }

  // Already settled — most webhook deliveries for an already-confirmed
  // order are Razorpay's documented at-least-once retries, not new
  // information.
  if (payment.status === 'paid' || payment.status === 'failed') {
    return jsonResponse({ received: true, handled: false, reason: 'Already settled.' })
  }

  if (eventType === 'payment.captured') {
    await supabaseAdmin
      .from('payments')
      .update({
        status: 'paid',
        razorpay_payment_id: razorpayPaymentId,
        raw_response: paymentEntity,
      })
      .eq('id', payment.id)
    await supabaseAdmin.from('orders').update({ status: 'confirmed' }).eq('id', payment.order_id)
  } else {
    await supabaseAdmin
      .from('payments')
      .update({
        status: 'failed',
        razorpay_payment_id: razorpayPaymentId,
        error_code: paymentEntity.error_code ?? null,
        error_description: paymentEntity.error_description ?? null,
        raw_response: paymentEntity,
      })
      .eq('id', payment.id)
    await supabaseAdmin.from('orders').update({ status: 'payment_failed' }).eq('id', payment.order_id)
  }

  return jsonResponse({ received: true, handled: true })
})
