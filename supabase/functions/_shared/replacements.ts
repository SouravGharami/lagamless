// Shared rules for the replacement edge functions (submit-replacement-request,
// get-replacement-options). Keeping them here means the options the customer
// is SHOWN and the request the server ACCEPTS are decided by the same code.
//
// Replacement is a separate workflow from returns/refunds. This module only
// ever READS `returns` (to stop a replacement being raised on an item that is
// already being returned/refunded); it never writes to it.

import { supabaseAdmin } from './supabaseAdmin.ts'

// Mirrors REPLACEMENT_REASONS in src/lib/replacementStatus.js and the `reason`
// check constraint on public.replacements (part-26-replacements.sql). Kept in
// sync by hand — Deno functions don't share a module graph with the Vite app.
export const REPLACEMENT_REASONS = [
  'Wrong size',
  'Wrong color',
  'Damaged product',
  'Defective product',
  'Wrong item received',
  'Other',
]

export const MAX_NOTE_LENGTH = 500

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SIZE_ORDER = ['S', 'M', 'L', 'XL', 'XXL']
const sizeRank = (size: string) => {
  const i = SIZE_ORDER.indexOf(size)
  return i === -1 ? SIZE_ORDER.length : i
}

export type OrderItemRow = {
  id: string
  product_id: string | null
  product_name: string
  size: string | null
  quantity: number
}

export type OwnedOrder = {
  id: string
  customer_email: string
  order_items: OrderItemRow[]
}

/**
 * Loads the order and confirms (1) it exists, (2) it belongs to `email`
 * (case-insensitive — the same guest-checkout trust boundary
 * submit-return-request and get-orders-by-email already use), and (3) it is
 * DELIVERED. Replacement is only offered after delivery and has no other
 * eligibility window.
 */
export async function getOwnedDeliveredOrder(
  orderId: string,
  email: string,
): Promise<{ order: OwnedOrder } | { error: string; status: number }> {
  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select('id, status, customer_email, order_items(id, product_id, product_name, size, quantity)')
    .eq('id', orderId)
    .maybeSingle()

  if (error) return { error: error.message, status: 500 }
  if (!order) return { error: 'Order not found.', status: 404 }
  if (!order.customer_email || order.customer_email.toLowerCase() !== email.toLowerCase()) {
    return { error: 'We could not match that order to this email address.', status: 403 }
  }
  if (order.status !== 'delivered') {
    return { error: 'A replacement can only be requested once the order has been delivered.', status: 400 }
  }
  return { order: order as unknown as OwnedOrder }
}

/**
 * Why (if at all) this order item can't have a NEW replacement requested.
 * Returns a customer-facing sentence, or null when it's allowed.
 *
 *  - a live replacement already exists (anything but `rejected`), or
 *  - a return/refund is already in progress or done for the item (any status
 *    but `rejected`; an order-level return with no item covers every item).
 *    A customer shouldn't be able to get both a refund and a replacement.
 */
export async function getBlockReason(orderId: string, orderItemId: string): Promise<string | null> {
  // orderItemId is interpolated into a PostgREST `.or()` expression below, so
  // refuse anything that isn't a plain UUID rather than trusting the caller.
  if (!UUID_RE.test(orderItemId)) throw new Error('Invalid order item id.')

  const { data: reps, error: repError } = await supabaseAdmin
    .from('replacements')
    .select('id')
    .eq('order_item_id', orderItemId)
    .neq('status', 'rejected')
    .limit(1)
  if (repError) throw new Error(repError.message)
  if (reps && reps.length > 0) return 'A replacement request already exists for this item.'

  const { data: rets, error: retError } = await supabaseAdmin
    .from('returns')
    .select('id')
    .eq('order_id', orderId)
    .neq('status', 'rejected')
    .or(`order_item_id.eq.${orderItemId},order_item_id.is.null`)
    .limit(1)
  if (retError) throw new Error(retError.message)
  if (rets && rets.length > 0) return 'A return is already in progress for this item, so it can’t also be replaced.'

  return null
}

export type ProductOptions = {
  sizes: { size: string; available: boolean }[]
  colors: { name: string; hex: string }[]
}

/**
 * The sizes/colors a replacement of `productId` may choose from. Sizes come
 * from product_variants (`available` = enough stock for `quantity` units —
 * the raw stock count is deliberately not exposed). Colors come from
 * product_colors, in the admin-configured order; empty when the product has
 * no colors configured (the UI then hides the color picker).
 */
export async function loadProductOptions(productId: string, quantity: number): Promise<ProductOptions | null> {
  const { data: product, error } = await supabaseAdmin
    .from('products')
    .select('id, product_variants(size, stock), product_colors(name, hex_code, sort_order)')
    .eq('id', productId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!product) return null

  const sizes = ((product as any).product_variants ?? [])
    .map((v: any) => ({ size: v.size as string, available: Number(v.stock) >= quantity }))
    .sort((a: any, b: any) => sizeRank(a.size) - sizeRank(b.size))

  const colors = ((product as any).product_colors ?? [])
    .slice()
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((c: any) => ({ name: c.name as string, hex: c.hex_code as string }))

  return { sizes, colors }
}
