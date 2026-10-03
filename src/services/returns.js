import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { toFunctionError } from './checkout.js'

/**
 * Return-request submission — backs ReturnRequestDialog.jsx, reached from
 * a delivered order's "Return" button on OrderLookup.jsx.
 *
 * Nothing here decides eligibility on its own: the `submit-return-request`
 * edge function re-checks ownership/status/delivery-date/return-window/
 * duplicate-request server-side (see
 * supabase/functions/submit-return-request/index.ts), the same trust
 * split checkout.js already uses for pricing.
 */

function requireSupabase() {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see supabase/SETUP.md) before submitting a return.',
    )
  }
}

/**
 * @param {{
 *   orderId: string,
 *   email: string,
 *   reason: string,
 *   note?: string,
 *   orderItemId?: string | null,
 * }} payload
 * @returns {Promise<{success: boolean, returnId: string}>}
 */
export async function submitReturnRequest({ orderId, email, reason, note, orderItemId }) {
  requireSupabase()
  const { data, error } = await supabase.functions.invoke('submit-return-request', {
    body: { orderId, email, reason, note: note || '', orderItemId: orderItemId || null },
  })
  if (error) throw await toFunctionError(error)
  if (data?.error) throw new Error(data.error)
  return data
}
