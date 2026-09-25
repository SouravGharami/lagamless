// POST /initiate-return-refund
//
// Body: { returnId }
//
// Called by the admin-only "Initiate Refund" button on
// src/admin/pages/AdminReturns.jsx (see initiateRefund() in
// src/services/adminReturns.js) when a return is `refund_pending` — the
// terminal state Part 22's inspection stage leaves a passed inspection in
// (received -> inspection -> refund_pending, see
// part-22-returns-inspection.sql).
//
// Runs with the service-role key, same as every other function in this
// folder, for the same reason: RAZORPAY_KEY_SECRET must never reach the
// frontend, and refunding money is exactly the kind of write that has no
// business going through a client-facing RLS policy. UNLIKE the
// guest-facing checkout/returns functions though, this one is admin-only
// — see getAdminUserIdFromRequest() in _shared/supabaseAdmin.ts, which
// re-implements the same `profiles.role = 'admin'` check the "Admins can
// manage returns" RLS policy (part-19-admin-returns.sql) already enforces
// for direct table access, since a service-role request has no
// `auth.uid()` for that Postgres function to read. This function is
// deployed WITH Supabase's default JWT verification (no --no-verify-jwt
// flag — see the deploy step this adds to functions/README.md);
// getAdminUserIdFromRequest() is what actually turns "has *a* valid
// Supabase session" into "is signed in as an admin".
//
// Refunds the FULL amount of the order's most recent `paid` payment.
// This app's returns can be raised at the whole-order level (see
// part-17-returns-table.sql's note on `order_item_id` being nullable), so
// there is no existing per-line-item price split to refund a *partial*
// amount against — a partial/prorated refund is out of scope for this
// step, same as it was left out of Part 22's inspection stage.
//
// Duplicate-refund prevention (belt AND suspenders):
//   1. The very first write below is an atomic UPDATE that claims this
//      return for refunding by setting `refund_status = 'processing'`,
//      guarded on `status = 'refund_pending' AND (refund_status IS NULL
//      OR refund_status = 'failed')`. Two concurrent "Initiate Refund"
//      calls for the same return (two admins, or one admin double-
//      clicking before the button disables) can never both win that
//      race — whichever request loses matches 0 rows and is told a
//      refund is already processing or done, the exact same "0 rows
//      matched" pattern transitionReturn() uses in
//      src/services/adminReturns.js for every other status transition.
//   2. `idx_returns_refund_id` (part-23-returns-refund.sql) is a unique
//      index on `refund_id` — even if step 1 were ever bypassed, the
//      same Razorpay refund id could never be saved to two rows.
//
// Before calling Razorpay, this function re-verifies the payment is
// actually eligible for a refund by fetching it fresh from Razorpay's own
// API (never trusting `payments.status` alone) — the same
// "don't trust local state, re-check with Razorpay" principle
// verify-razorpay-payment/index.ts already applies to the forward payment
// flow.

import { handleOptions, jsonResponse } from '../_shared/cors.ts'
import { getAdminUserIdFromRequest, supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { createRazorpayRefund, fetchRazorpayPayment } from '../_shared/razorpay.ts'

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const adminUserId = await getAdminUserIdFromRequest(req)
  if (!adminUserId) {
    return jsonResponse({ error: 'Admin sign-in required to initiate a refund.' }, 403)
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const returnId = body?.returnId
  if (!returnId || typeof returnId !== 'string') {
    return jsonResponse({ error: 'Missing returnId.' }, 400)
  }

  const { data: returnRow, error: returnLookupError } = await supabaseAdmin
    .from('returns')
    .select('id, order_id, status, refund_status')
    .eq('id', returnId)
    .maybeSingle()

  if (returnLookupError) {
    return jsonResponse({ error: `Could not load return: ${returnLookupError.message}` }, 500)
  }
  if (!returnRow) {
    return jsonResponse({ error: 'Return not found.' }, 404)
  }
  if (returnRow.status !== 'refund_pending') {
    return jsonResponse(
      { error: `This return is "${returnRow.status}", not "refund_pending" — a refund can't be initiated.` },
      409,
    )
  }

  // --- Cash on Delivery orders are refunded by hand --------------------------
  // A COD customer paid cash to the courier, so there is no Razorpay payment to
  // refund against. The store sends the money back itself (UPI / bank transfer)
  // and the admin records that here, with the transfer's reference (UTR / UPI
  // transaction id) so there's an audit trail. Same duplicate-prevention claim
  // as the Razorpay path below — this never touches Razorpay.
  const { data: orderPayments, error: orderPaymentsError } = await supabaseAdmin
    .from('payments')
    .select('id, provider, status, amount')
    .eq('order_id', returnRow.order_id)
    .order('created_at', { ascending: false })

  if (orderPaymentsError) {
    return jsonResponse({ error: `Could not load the payment for this order: ${orderPaymentsError.message}` }, 500)
  }

  const codPayment = (orderPayments ?? []).find((p) => p.provider === 'cod')
  if (codPayment) {
    return await refundCodManually(returnId, codPayment, body?.manualReference)
  }

  // --- Claim the refund (duplicate-prevention lock) -------------------------
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from('returns')
    .update({ refund_status: 'processing', refund_initiated_at: new Date().toISOString(), refund_failure_reason: null })
    .eq('id', returnId)
    .eq('status', 'refund_pending')
    .or('refund_status.is.null,refund_status.eq.failed')
    .select('id')
    .maybeSingle()

  if (claimError) {
    return jsonResponse({ error: `Could not start refund: ${claimError.message}` }, 500)
  }
  if (!claimed) {
    return jsonResponse(
      { error: 'A refund for this return is already processing or has already completed. Refresh to see its current state.' },
      409,
    )
  }

  // --- Find the payment to refund against ------------------------------------
  const { data: payment, error: paymentLookupError } = await supabaseAdmin
    .from('payments')
    .select('id, razorpay_payment_id, amount, status')
    .eq('order_id', returnRow.order_id)
    .eq('status', 'paid')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (paymentLookupError) {
    return failRefund(returnId, `Could not load the payment for this order: ${paymentLookupError.message}`)
  }
  if (!payment || !payment.razorpay_payment_id) {
    return failRefund(returnId, 'No paid Razorpay payment was found for this order — nothing to refund.')
  }

  // --- Re-verify eligibility directly against Razorpay -----------------------
  let razorpayPayment: any
  try {
    razorpayPayment = await fetchRazorpayPayment(payment.razorpay_payment_id)
  } catch (err) {
    return failRefund(returnId, `Could not confirm payment ${payment.razorpay_payment_id} with Razorpay: ${(err as Error).message}`)
  }

  const totalPaise = Number(razorpayPayment.amount)
  const alreadyRefundedPaise = Number(razorpayPayment.amount_refunded ?? 0)

  if (razorpayPayment.status !== 'captured') {
    return failRefund(
      returnId,
      `Payment ${payment.razorpay_payment_id} is not eligible for refund — Razorpay reports its status as "${razorpayPayment.status}", not "captured".`,
    )
  }
  if (alreadyRefundedPaise >= totalPaise) {
    return failRefund(
      returnId,
      `Payment ${payment.razorpay_payment_id} has already been fully refunded at Razorpay (${alreadyRefundedPaise}/${totalPaise} paise).`,
    )
  }

  const amountToRefundPaise = totalPaise - alreadyRefundedPaise

  // --- Call Razorpay -----------------------------------------------------------
  let refund
  try {
    refund = await createRazorpayRefund({
      paymentId: payment.razorpay_payment_id,
      amountPaise: amountToRefundPaise,
      notes: { return_id: returnId, order_id: returnRow.order_id },
    })
  } catch (err) {
    return failRefund(returnId, (err as Error).message)
  }

  const refundedAmount = Number((refund.amount / 100).toFixed(2))
  const nowIso = new Date().toISOString()

  const { data: updatedReturn, error: updateError } = await supabaseAdmin
    .from('returns')
    .update({
      status: 'refunded',
      refund_status: 'processed',
      refund_id: refund.id,
      refund_amount: refundedAmount,
      refund_failure_reason: null,
      refunded_at: nowIso,
    })
    .eq('id', returnId)
    .select('*')
    .maybeSingle()

  if (updateError || !updatedReturn) {
    // The refund DID succeed at Razorpay at this point — this is a save
    // failure, not a refund failure, so it's reported distinctly rather
    // than as a generic "refund failed" (which would wrongly invite a
    // retry and risk a second real refund at Razorpay).
    return jsonResponse(
      {
        error: `Refund ${refund.id} succeeded at Razorpay but saving it to the return record failed: ${updateError?.message ?? 'unknown error'}. Do not retry from here — check the Razorpay Dashboard and update this return manually.`,
        refundId: refund.id,
      },
      500,
    )
  }

  // Keep `payments.status` consistent with the outcome — 'refunded' is
  // already a valid value in that column's check constraint (schema.sql),
  // so no migration is needed for this write.
  await supabaseAdmin.from('payments').update({ status: 'refunded' }).eq('id', payment.id)

  return jsonResponse({
    success: true,
    return: {
      id: updatedReturn.id,
      status: updatedReturn.status,
      refundId: updatedReturn.refund_id,
      refundAmount: updatedReturn.refund_amount,
      refundStatus: updatedReturn.refund_status,
      refundedAt: updatedReturn.refunded_at,
    },
  })
})

/**
 * Records a failed refund attempt: `refund_status = 'failed'` +
 * `refund_failure_reason`, while leaving `returns.status` at
 * 'refund_pending' so the admin sees the failure and can retry — a failed
 * attempt is not a terminal state. Always responds 422 (a rejected
 * business operation, not a server crash).
 */
async function failRefund(returnId: string, reason: string) {
  await supabaseAdmin.from('returns').update({ refund_status: 'failed', refund_failure_reason: reason }).eq('id', returnId)
  return jsonResponse({ error: reason }, 422)
}

/**
 * Records a manual refund for a Cash on Delivery order. `reference` is the
 * bank/UPI transfer reference the admin entered — required, so every COD refund
 * can be traced to a real transfer. Refunds the full COD payment amount, same
 * whole-order rule as the Razorpay path.
 */
async function refundCodManually(
  returnId: string,
  payment: { id: string; amount: number | string },
  reference: unknown,
) {
  const ref = typeof reference === 'string' ? reference.trim() : ''
  if (ref.length < 4 || ref.length > 100) {
    return jsonResponse(
      { error: 'Enter the UPI / bank transfer reference (at least 4 characters) for this COD refund.' },
      400,
    )
  }

  // Duplicate-prevention lock — identical to the Razorpay path.
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from('returns')
    .update({ refund_status: 'processing', refund_initiated_at: new Date().toISOString(), refund_failure_reason: null })
    .eq('id', returnId)
    .eq('status', 'refund_pending')
    .or('refund_status.is.null,refund_status.eq.failed')
    .select('id')
    .maybeSingle()

  if (claimError) {
    return jsonResponse({ error: `Could not start refund: ${claimError.message}` }, 500)
  }
  if (!claimed) {
    return jsonResponse(
      { error: 'A refund for this return is already processing or has already completed. Refresh to see its current state.' },
      409,
    )
  }

  const { data: updatedReturn, error: updateError } = await supabaseAdmin
    .from('returns')
    .update({
      status: 'refunded',
      refund_status: 'processed',
      refund_id: `manual:${ref}`,
      refund_amount: Number(payment.amount),
      refund_failure_reason: null,
      refunded_at: new Date().toISOString(),
    })
    .eq('id', returnId)
    .select('*')
    .maybeSingle()

  if (updateError || !updatedReturn) {
    // e.g. the unique index on refund_id if the same reference was already used.
    const reason = updateError?.message?.includes('idx_returns_refund_id')
      ? 'That transfer reference has already been used for another refund.'
      : `Could not save the refund: ${updateError?.message ?? 'unknown error'}`
    return failRefund(returnId, reason)
  }

  await supabaseAdmin.from('payments').update({ status: 'refunded' }).eq('id', payment.id)

  return jsonResponse({
    success: true,
    return: {
      id: updatedReturn.id,
      status: updatedReturn.status,
      refundId: updatedReturn.refund_id,
      refundAmount: updatedReturn.refund_amount,
      refundStatus: updatedReturn.refund_status,
      refundedAt: updatedReturn.refunded_at,
    },
  })
}
