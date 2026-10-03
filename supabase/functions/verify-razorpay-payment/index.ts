// POST /verify-razorpay-payment
//
// Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
//
// Called by the frontend the instant Razorpay Checkout's `handler` fires,
// so the customer gets an immediate success/fail redirect without waiting
// on the webhook round-trip. It is NOT the only source of truth, though —
// razorpay-webhook (below) applies the exact same update and is what
// actually governs the order if the customer closes the tab before this
// call completes (e.g. flaky connection right after paying). Both paths
// write through the same idempotent upsert keyed on razorpay_order_id, so
// whichever arrives first or last, the end state is the same.
//
// Never trusts the signature alone: after the HMAC check passes, it also
// re-fetches the payment from Razorpay's API and cross-checks status,
// amount, and order_id against what's on file, so a well-formed but
// incorrect claim can't slip through.

import { handleOptions, jsonResponse } from '../_shared/cors.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { fetchRazorpayPayment, verifyPaymentSignature } from '../_shared/razorpay.ts'

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

  const { razorpay_order_id: razorpayOrderId, razorpay_payment_id: razorpayPaymentId, razorpay_signature: razorpaySignature } = body ?? {}

  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return jsonResponse({ error: 'Missing razorpay_order_id, razorpay_payment_id, or razorpay_signature.' }, 400)
  }

  const { data: payment, error: paymentLookupError } = await supabaseAdmin
    .from('payments')
    .select('id, order_id, amount, status')
    .eq('razorpay_order_id', razorpayOrderId)
    .maybeSingle()

  if (paymentLookupError || !payment) {
    return jsonResponse({ error: 'No matching payment found for this order.' }, 404)
  }

  // Already settled (e.g. the webhook beat us to it) — report the current
  // state rather than re-doing the work.
  if (payment.status === 'paid' || payment.status === 'failed') {
    return respondWithOrderState(payment.order_id, payment.status)
  }

  const signatureValid = await verifyPaymentSignature({
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  })

  if (!signatureValid) {
    await markFailed(payment.id, payment.order_id, {
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
      error_description: 'Signature verification failed.',
    })
    return respondWithOrderState(payment.order_id, 'failed')
  }

  let razorpayPayment
  try {
    razorpayPayment = await fetchRazorpayPayment(razorpayPaymentId)
  } catch (err) {
    await markFailed(payment.id, payment.order_id, {
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
      error_description: `Could not confirm payment with Razorpay: ${(err as Error).message}`,
    })
    return respondWithOrderState(payment.order_id, 'failed')
  }

  const amountMatches = Number(razorpayPayment.amount) === Math.round(Number(payment.amount) * 100)
  const orderMatches = razorpayPayment.order_id === razorpayOrderId
  const statusOk = razorpayPayment.status === 'captured' || razorpayPayment.status === 'authorized'

  if (!amountMatches || !orderMatches || !statusOk) {
    await markFailed(payment.id, payment.order_id, {
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
      error_code: (razorpayPayment.error_code as string) ?? null,
      error_description: `Payment record mismatch or unexpected status (${razorpayPayment.status}).`,
      raw_response: razorpayPayment,
    })
    return respondWithOrderState(payment.order_id, 'failed')
  }

  await markPaid(payment.id, payment.order_id, {
    razorpay_payment_id: razorpayPaymentId,
    razorpay_signature: razorpaySignature,
    raw_response: razorpayPayment,
  })

  return respondWithOrderState(payment.order_id, 'paid')
})

async function markPaid(paymentId: string, orderId: string, fields: Record<string, unknown>) {
  await supabaseAdmin.from('payments').update({ status: 'paid', ...fields }).eq('id', paymentId)
  await supabaseAdmin.from('orders').update({ status: 'confirmed' }).eq('id', orderId)
}

async function markFailed(paymentId: string, orderId: string, fields: Record<string, unknown>) {
  await supabaseAdmin.from('payments').update({ status: 'failed', ...fields }).eq('id', paymentId)
  await supabaseAdmin.from('orders').update({ status: 'payment_failed' }).eq('id', orderId)
}

function respondWithOrderState(orderId: string, paymentStatus: 'paid' | 'failed') {
  return jsonResponse({
    success: paymentStatus === 'paid',
    orderId,
    status: paymentStatus === 'paid' ? 'confirmed' : 'payment_failed',
  })
}
