import { getProductImagePublicUrl } from './supabase.js'

/**
 * PostgREST embed used by the admin orders/returns queries to fetch the
 * product photos for an `order_items` row (order_items.product_id -> products).
 */
export const ORDER_ITEM_IMAGE_EMBED = 'products(product_images(image_url, storage_path, image_type, sort_order))'

/**
 * Picks the best display photo for an order item from its embedded product
 * row: the "main" slot first, otherwise the lowest sort_order. Returns null
 * when the product has no photo (or was deleted).
 * @param {{ product_images?: Array<{image_url?: string|null, storage_path?: string|null, image_type?: string, sort_order?: number}> } | null | undefined} product
 * @returns {string | null}
 */
export function pickOrderItemImage(product) {
  const rows = product?.product_images || []
  if (rows.length === 0) return null
  const sorted = [...rows].sort((a, b) => {
    const am = a.image_type === 'main' ? 0 : 1
    const bm = b.image_type === 'main' ? 0 : 1
    if (am !== bm) return am - bm
    return (a.sort_order ?? 0) - (b.sort_order ?? 0)
  })
  for (const row of sorted) {
    const src = row.image_url || getProductImagePublicUrl(row.storage_path)
    if (src) return src
  }
  return null
}
