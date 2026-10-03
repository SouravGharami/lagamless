import { supabase, isSupabaseConfigured, getProductImagePublicUrl } from '../lib/supabase.js'

/**
 * Fallback photo lookup for the customer "Track your order" screens.
 *
 * `get-orders-by-email` now returns `imageUrl` on every item, but if that edge
 * function hasn't been redeployed yet (or an item has no product link), this
 * looks the photo up by product name straight from the public storefront
 * tables — `products` + `product_images` are readable by anyone for published
 * products (schema.sql RLS), so no login or extra function is needed.
 *
 * @param {string[]} names - product names as stored on order_items.product_name
 * @returns {Promise<Record<string, string>>} product name -> image URL
 */
export async function fetchImagesByProductName(names) {
  const unique = [...new Set((names || []).filter(Boolean))]
  if (!isSupabaseConfigured || !supabase || unique.length === 0) return {}
  const { data, error } = await supabase
    .from('products')
    .select('name, product_images(image_url, storage_path, image_type, sort_order)')
    .in('name', unique)
  if (error || !data) return {}

  const out = {}
  for (const product of data) {
    const rows = [...(product.product_images || [])].sort(
      (a, b) =>
        (a.image_type === 'main' ? 0 : 1) - (b.image_type === 'main' ? 0 : 1) ||
        (a.sort_order ?? 0) - (b.sort_order ?? 0),
    )
    for (const row of rows) {
      const src = row.image_url || getProductImagePublicUrl(row.storage_path)
      if (src) {
        out[product.name] = src
        break
      }
    }
  }
  return out
}
