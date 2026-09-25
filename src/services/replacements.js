import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { toFunctionError } from './checkout.js'

/**
 * Customer-facing replacement service — backs ReplacementRequestDialog.jsx
 * (reached from a delivered order's "Replace" button in OrderHistory.jsx) and
 * the replacement status shown on each order card.
 *
 * Same trust split as returns.js / checkout.js: nothing here decides
 * eligibility. The edge functions re-check ownership, DELIVERED status, that
 * the product is the SAME one that was bought, that the size is in stock and
 * the color is offered, and duplicate / already-returned items (see
 * supabase/functions/submit-replacement-request/index.ts).
 */

function requireSupabase() {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see supabase/SETUP.md) before requesting a replacement.',
    )
  }
}

async function invoke(name, body) {
  requireSupabase()
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) throw await toFunctionError(error)
  if (data?.error) throw new Error(data.error)
  return data
}

/**
 * Sizes (with an in-stock flag), colors and any block reason for every item on
 * a delivered order — the choices the Replace dialog is allowed to offer.
 *
 * @param {{ orderId: string, email: string }} payload
 * @returns {Promise<{ items: Array<{
 *   orderItemId: string, productId: string | null, productName: string,
 *   size: string | null, quantity: number,
 *   sizes: Array<{ size: string, available: boolean }>,
 *   colors: Array<{ name: string, hex: string }>,
 *   blockedReason: string | null,
 * }> }>}
 */
export function getReplacementOptions({ orderId, email }) {
  return invoke('get-replacement-options', { orderId, email })
}

/**
 * @param {{
 *   orderId: string,
 *   email: string,
 *   orderItemId: string,
 *   requestedSize: string,
 *   requestedColor?: string | null,   // null/'' = keep the same color
 *   reason: string,
 *   note?: string,
 * }} payload
 * @returns {Promise<{ success: boolean, replacementId: string, status: string }>}
 */
export function submitReplacementRequest({ orderId, email, orderItemId, requestedSize, requestedColor, reason, note }) {
  return invoke('submit-replacement-request', {
    orderId,
    email,
    orderItemId,
    requestedSize,
    requestedColor: requestedColor || null,
    reason,
    note: note || '',
  })
}

/**
 * Every replacement request for this email, newest first.
 * @param {string} email
 * @returns {Promise<{ replacements: Array<object> }>}
 */
export function getReplacementsByEmail(email) {
  return invoke('get-replacements-by-email', { email })
}
