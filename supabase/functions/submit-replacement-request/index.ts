// POST /submit-replacement-request
//
// Body: { orderId, email, orderItemId, requestedSize, requestedColor, reason, note }
//
// Backs the "Submit replacement request" button in
// src/components/ReplacementRequestDialog.jsx, opened from a delivered order's
// "Replace" button. Writes to `public.replacements`
// (supabase/part-26-replacements.sql). That table has no customer-facing
// policy, so — like submit-return-request for `returns` — this service-role
// function is the only path a customer's request can be written through.
//
// Nothing the client sends is trusted for anything that matters:
//   - the PRODUCT is always taken from the order item, so a customer can only
//     ever ask for a replacement of the SAME product they bought;
//   - the size must exist for that product and be in stock;
//   - the color must be one the product is actually offered in;
//   - ownership (email), DELIVERED status, duplicates, and an already-open
//     return/refund on the item are all re-checked here.
//
// SECURITY NOTE — same guest-checkout trust boundary as submit-return-request:
// "the order belongs to the customer" means the email typed matches
// orders.customer_email (case-insensitive). See that function's note.
//
// Returns: { success: true, replacementId, status } on success, { error } otherwise.

import { handleOptions, jsonResponse } from '../_shared/cors.ts'
import { getUserIdFromRequest, supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import {
  EMAIL_RE,
  MAX_NOTE_LENGTH,
  REPLACEMENT_REASONS,
  getBlockReason,
  getOwnedDeliveredOrder,
  loadProductOptions,
} from '../_shared/replacements.ts'

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
  const orderItemId = typeof body?.orderItemId === 'string' ? body.orderItemId.trim() : ''
  const requestedSize = typeof body?.requestedSize === 'string' ? body.requestedSize.trim() : ''
  // Empty / missing = "keep the same color".
  const requestedColor =
    typeof body?.requestedColor === 'string' && body.requestedColor.trim() ? body.requestedColor.trim() : null
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, MAX_NOTE_LENGTH) : ''

  if (!orderId) return jsonResponse({ error: 'Missing orderId.' }, 400)
  if (!email || !EMAIL_RE.test(email)) return jsonResponse({ error: 'Enter a valid email address.' }, 400)
  if (!orderItemId) return jsonResponse({ error: 'Select which item you want replaced.' }, 400)
  if (!requestedSize) return jsonResponse({ error: 'Select the size you want.' }, 400)
  if (!REPLACEMENT_REASONS.includes(reason)) {
    return jsonResponse({ error: 'Select a valid reason for your replacement.' }, 400)
  }

  try {
    // --- Ownership + DELIVERED, against the database's own record. --------
    const owned = await getOwnedDeliveredOrder(orderId, email)
    if ('error' in owned) return jsonResponse({ error: owned.error }, owned.status)
    const { order } = owned

    // The item must actually belong to this order.
    const item = order.order_items.find((i) => i.id === orderItemId)
    if (!item) return jsonResponse({ error: 'That item does not belong to this order.' }, 400)
    if (!item.product_id) {
      return jsonResponse({ error: 'This item is no longer linked to a product, so it can’t be replaced online.' }, 400)
    }

    // --- No live replacement / open return already on this item. ----------
    const blocked = await getBlockReason(order.id, item.id)
    if (blocked) return jsonResponse({ error: blocked }, 409)

    // --- Same product only: size + color must be offered for THIS product. -
    const options = await loadProductOptions(item.product_id, item.quantity)
    if (!options) return jsonResponse({ error: 'This product is no longer available.' }, 404)

    const sizeOption = options.sizes.find((s) => s.size === requestedSize)
    if (!sizeOption) {
      return jsonResponse({ error: `Size ${requestedSize} isn’t offered for this product.` }, 400)
    }
    if (!sizeOption.available) {
      return jsonResponse({ error: `Size ${requestedSize} is currently out of stock. Please choose another size.` }, 409)
    }

    if (requestedColor !== null && !options.colors.some((c) => c.name === requestedColor)) {
      return jsonResponse({ error: `${requestedColor} isn’t an available color for this product.` }, 400)
    }

    // Reason/selection consistency (mirrors the form's own checks).
    if (reason === 'Wrong size' && requestedSize === item.size) {
      return jsonResponse({ error: 'You picked “Wrong size”, so please choose a different size to receive.' }, 400)
    }
    if (reason === 'Wrong color' && requestedColor === null) {
      return jsonResponse(
        {
          error:
            options.colors.length === 0
              ? 'This product isn’t offered in other colors. Please pick another reason, or choose “Other” and tell us in the note.'
              : 'You picked “Wrong color”, so please choose the color you want instead.',
        },
        400,
      )
    }

    const customerId = await getUserIdFromRequest(req)

    const { data: created, error: insertError } = await supabaseAdmin
      .from('replacements')
      .insert({
        order_id: order.id,
        order_item_id: item.id,
        product_id: item.product_id,
        customer_id: customerId,
        customer_email: order.customer_email,
        // Snapshot of what they have now. Color isn't recorded at checkout,
        // so original_color stays null (see part-26 COLOR NOTE).
        original_size: item.size,
        requested_size: requestedSize,
        requested_color: requestedColor,
        quantity: item.quantity,
        reason,
        customer_note: note || null,
        status: 'requested',
      })
      .select('id, status')
      .single()

    if (insertError || !created) {
      // 23505 = the unique "one live replacement per item" index: two
      // near-simultaneous submits — the second one lands here.
      if (insertError?.code === '23505') {
        return jsonResponse({ error: 'A replacement request already exists for this item.' }, 409)
      }
      console.error('submit-replacement-request insert failed:', insertError)
      return jsonResponse({ error: 'We could not submit your replacement request. Please try again.' }, 500)
    }

    return jsonResponse({ success: true, replacementId: created.id, status: created.status })
  } catch (err) {
    console.error('submit-replacement-request failed:', err)
    return jsonResponse({ error: 'We could not submit your replacement request. Please try again.' }, 500)
  }
})
