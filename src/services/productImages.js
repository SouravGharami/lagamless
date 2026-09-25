import { supabase, isSupabaseConfigured, PRODUCT_IMAGES_BUCKET, getProductImagePublicUrl } from '../lib/supabase.js'

/**
 * Product image storage helpers, built against the `product-images`
 * Supabase Storage bucket (see supabase/SETUP.md §7) and the
 * `product_images` table.
 *
 * As of Part 08B-2A, Storage RLS on this bucket allows public reads and
 * admin-only writes (`part-08b2a-admin-security.sql`), and `/admin/*` is a
 * real, enforced security boundary (`AdminRoute` + `is_admin()`). So as of
 * Part 08B-2B-1, every function in this file is called for real by the
 * admin product form (`src/admin/components/ImageSlotManager.jsx` via
 * `src/services/adminProducts.js`) — uploads, alt-text/order updates, and
 * deletions all persist to Supabase Storage + Postgres. There is no local
 * preview-only fallback for admin writes.
 */

/**
 * Uploads a File to the product-images bucket under a per-product path,
 * and returns the storage path + public URL. Does NOT write to the
 * `product_images` table — call `saveProductImageRecord` (or an admin
 * service function) with the result to do that.
 *
 * @param {string} productId
 * @param {string} slotKey - e.g. "main", "front", "detail"
 * @param {File} file
 * @returns {Promise<{ storagePath: string, publicUrl: string | null }>}
 */
export async function uploadProductImage(productId, slotKey, file) {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured — see supabase/SETUP.md.')
  }
  const extension = file.name.split('.').pop() || 'jpg'
  // Timestamped so every upload gets a brand-new path — replacing a
  // slot's image never reuses the previous file's URL. That's what makes
  // a long, effectively-immutable cache lifetime safe below: a URL that
  // exists always points at the same bytes forever, so there's no
  // staleness risk from caching it aggressively, and the old (now
  // unreferenced) path just ages out of caches/CDNs harmlessly once
  // `deleteProductImageFiles` removes it from Storage.
  const storagePath = `${productId}/${slotKey}-${Date.now()}.${extension}`

  const { error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    // One year (in seconds) — safe specifically because of the versioned
    // path above, not despite it. Was '3600' (1 hour), which meant a
    // browser silently refetched the exact same product photo bytes
    // every hour on any long storefront session.
    .upload(storagePath, file, { upsert: true, cacheControl: '31536000' })

  if (error) throw error

  return { storagePath, publicUrl: getProductImagePublicUrl(storagePath) }
}

/**
 * Upserts a `product_images` row for one product + image slot.
 * @param {string} productId
 * @param {string} slotKey
 * @param {{ storagePath?: string, imageUrl?: string, altText?: string, sortOrder?: number }} fields
 */
export async function saveProductImageRecord(productId, slotKey, fields) {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured — see supabase/SETUP.md.')
  }
  const { error } = await supabase.from('product_images').insert({
    product_id: productId,
    image_type: slotKey,
    storage_path: fields.storagePath ?? null,
    image_url: fields.imageUrl ?? null,
    alt_text: fields.altText ?? '',
    sort_order: fields.sortOrder ?? 0,
  })
  if (error) throw error
}

/**
 * Updates an existing `product_images` row — used when an admin replaces a
 * slot's file (new storage path/URL), edits alt text, or changes the sort
 * order, without needing to delete-then-recreate the row (which would
 * needlessly lose the row's id/created_at).
 *
 * @param {string} imageId
 * @param {{ storagePath?: string, imageUrl?: string, altText?: string, sortOrder?: number }} fields
 */
export async function updateProductImageRecord(imageId, fields) {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured — see supabase/SETUP.md.')
  }
  const payload = {}
  if (fields.storagePath !== undefined) payload.storage_path = fields.storagePath
  if (fields.imageUrl !== undefined) payload.image_url = fields.imageUrl
  if (fields.altText !== undefined) payload.alt_text = fields.altText
  if (fields.sortOrder !== undefined) payload.sort_order = fields.sortOrder

  const { error } = await supabase.from('product_images').update(payload).eq('id', imageId)
  if (error) throw error
}

/**
 * Deletes a single `product_images` row. Does NOT remove the underlying
 * Storage file — call `deleteProductImageFiles` first (or alongside) if
 * the file should also be removed.
 * @param {string} imageId
 */
export async function deleteProductImageRecord(imageId) {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured — see supabase/SETUP.md.')
  }
  const { error } = await supabase.from('product_images').delete().eq('id', imageId)
  if (error) throw error
}

/**
 * Deletes one or more files from the product-images Storage bucket.
 * Silently no-ops on an empty/falsy list so callers don't need to guard.
 * @param {Array<string | null | undefined>} storagePaths
 */
export async function deleteProductImageFiles(storagePaths) {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured — see supabase/SETUP.md.')
  }
  const paths = (storagePaths || []).filter(Boolean)
  if (paths.length === 0) return
  const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove(paths)
  if (error) throw error
}
