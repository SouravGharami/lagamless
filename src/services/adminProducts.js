import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { mapSupabaseProduct } from '../lib/mapSupabaseProduct.js'
import {
  uploadProductImage,
  saveProductImageRecord,
  updateProductImageRecord,
  deleteProductImageRecord,
  deleteProductImageFiles,
} from './productImages.js'
import { slugify } from '../lib/slugify.js'

/**
 * Admin product service — real Supabase, no local/in-memory fallback.
 *
 * Every write here goes straight to Postgres (`products`, `product_images`,
 * `product_variants`) and Supabase Storage (`product-images`), guarded by
 * the RLS policies added in `supabase/part-08b2a-admin-security.sql`.
 * There is deliberately no "write to the local catalog instead" path: a
 * failed Supabase call is surfaced to the caller as a rejected promise
 * (with a friendly message where possible), not silently swallowed, and
 * `AdminProductNew`/`AdminProductEdit`/`AdminProducts`/`AdminInventory`
 * already display whatever message reaches them.
 *
 * The admin panel is the one place allowed to see draft products too —
 * every list/read function here queries without a `status` filter. The
 * storefront-facing `src/services/products.js` is untouched and still
 * only ever selects `status = 'published'`.
 */

const ADMIN_PRODUCT_SELECT = '*, product_images(*), product_variants(*)'
const IMAGE_SLOT_ORDER = ['main', 'front', 'back', 'model', 'detail', 'fabric']

function requireSupabase() {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see supabase/SETUP.md) before using the admin panel.',
    )
  }
}

/** Turns a Postgres unique-violation into a message naming the field, where recognizable. */
function friendlyWriteError(error) {
  if (error?.code === '23505') {
    const msg = error.message || ''
    if (msg.includes('slug')) return new Error('Another product already uses that slug.')
    if (msg.includes('product_number')) return new Error('Another product already uses that product number.')
    if (msg.includes('products_sku')) return new Error('Another product already uses that SKU.')
    return new Error('That would duplicate a unique field (SKU, slug, or product number) on another product.')
  }
  return error instanceof Error ? error : new Error(error?.message || 'Something went wrong saving the product.')
}

/** Maps this app's camelCase Product/form shape onto the `products` table's columns. */
function productFormToRow(data) {
  return {
    product_number: data.productNumber?.trim(),
    sku: data.sku?.trim(),
    name: data.name?.trim(),
    slug: data.slug,
    price: Number(data.price) || 0,
    compare_at_price:
      data.compareAtPrice === null || data.compareAtPrice === undefined ? null : Number(data.compareAtPrice),
    description: data.description?.trim() || '',
    story: data.story?.trim() || '',
    fabric: data.fabric?.trim() || '',
    gsm: data.gsm === '' || data.gsm === null || data.gsm === undefined ? 0 : Number(data.gsm),
    fit: data.fit?.trim() || '',
    construction: data.construction?.trim() || '',
    design: data.design?.trim() || '',
    care: data.care?.trim() || '',
    styling_note: data.stylingNote?.trim() || '',
    measurements: data.measurements || {},
    category: data.category?.trim() || '',
    tags: data.tags || [],
    is_featured: !!data.isFeatured,
    is_new_arrival: !!data.isNewArrival,
    status: data.status === 'published' ? 'published' : 'draft',
  }
}

function indexVariantsBySize(variants) {
  const map = {}
  for (const v of variants || []) map[v.size] = v
  return map
}

/**
 * Reconciles `product_variants` for one product against a desired
 * `{size: string}[]` list + `{[size]: {stock}}` map: deletes rows for
 * sizes no longer selected, and upserts (creates or updates) one row per
 * remaining size. One inventory system, same table the storefront reads
 * from — an admin stock edit is a normal `product_variants` write.
 */
async function syncVariants(productId, sizes, variantsBySize) {
  const { data: existing, error } = await supabase
    .from('product_variants')
    .select('id, size')
    .eq('product_id', productId)
  if (error) throw error

  const desired = new Set(sizes)
  const toDelete = (existing || []).filter((v) => !desired.has(v.size))
  if (toDelete.length) {
    const { error: delErr } = await supabase
      .from('product_variants')
      .delete()
      .in('id', toDelete.map((v) => v.id))
    if (delErr) throw delErr
  }

  if (sizes.length) {
    const upserts = sizes.map((size) => ({
      product_id: productId,
      size,
      stock: Math.max(0, Math.round(Number(variantsBySize[size]?.stock) || 0)),
    }))
    const { error: upErr } = await supabase
      .from('product_variants')
      .upsert(upserts, { onConflict: 'product_id,size' })
    if (upErr) throw upErr
  }
}

/**
 * Reconciles `product_images` + Storage for one product against the
 * admin form's `images` state (see `ImageSlotManager.jsx`). Each of the
 * six fixed slots (`main`/`front`/`back`/`model`/`detail`/`fabric`) may
 * be: unchanged (has an id, no pending file, not removed — alt text/order
 * are still re-synced so edits to those are never dropped), replaced (has
 * a pending `File` — uploaded, then the row is created or updated to
 * point at the new file, and the old Storage file is deleted if it
 * differs), removed (marked `removed` — the row and its Storage file, if
 * any, are deleted), or empty (never had an image — skipped).
 */
async function syncProductImages(productId, images) {
  for (const [slotKey, slot] of Object.entries(images || {})) {
    if (!slot) continue
    const orderIndex = IMAGE_SLOT_ORDER.indexOf(slotKey)
    const sortOrder = orderIndex === -1 ? 0 : orderIndex

    if (slot.removed) {
      if (slot.id) {
        if (slot.storagePath) {
          await deleteProductImageFiles([slot.storagePath])
        }
        await deleteProductImageRecord(slot.id)
      }
      continue
    }

    if (slot.pendingFile) {
      const { storagePath, publicUrl } = await uploadProductImage(productId, slotKey, slot.pendingFile)
      if (slot.id) {
        const oldPath = slot.storagePath
        await updateProductImageRecord(slot.id, {
          storagePath,
          imageUrl: publicUrl,
          altText: slot.alt || '',
          sortOrder,
        })
        if (oldPath && oldPath !== storagePath) {
          await deleteProductImageFiles([oldPath])
        }
      } else {
        await saveProductImageRecord(productId, slotKey, {
          storagePath,
          imageUrl: publicUrl,
          altText: slot.alt || '',
          sortOrder,
        })
      }
      continue
    }

    if (slot.id && slot.src) {
      // No file change — keep alt text / slot order in sync with any edits.
      await updateProductImageRecord(slot.id, { altText: slot.alt || '', sortOrder })
    }
  }
}

/** @returns {Promise<import('../data/products.js').Product[]>} */
export async function getProducts() {
  requireSupabase()
  const { data, error } = await supabase
    .from('products')
    .select(ADMIN_PRODUCT_SELECT)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map(mapSupabaseProduct)
}

/**
 * @param {string} id
 * @returns {Promise<import('../data/products.js').Product | undefined>}
 */
export async function getProduct(id) {
  requireSupabase()
  const { data, error } = await supabase
    .from('products')
    .select(ADMIN_PRODUCT_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? mapSupabaseProduct(data) : undefined
}

/**
 * Creates a new product row, then reconciles its variants and images.
 * @param {object} data - the form's product shape (see ProductForm.jsx)
 * @returns {Promise<import('../data/products.js').Product>}
 */
export async function createProduct(data) {
  requireSupabase()
  const slug = data.slug?.trim() || slugify(data.name || '')
  const row = productFormToRow({ ...data, slug })

  const { data: inserted, error } = await supabase.from('products').insert(row).select('id').single()
  if (error) throw friendlyWriteError(error)

  const productId = inserted.id
  await syncVariants(productId, data.sizes || [], indexVariantsBySize(data.variants))
  await syncProductImages(productId, data.images || {})

  const created = await getProduct(productId)
  if (!created) throw new Error('Product was created but could not be reloaded.')
  return created
}

/**
 * Updates an existing product row, then reconciles its variants and images.
 * @param {string} id
 * @param {object} data
 * @returns {Promise<import('../data/products.js').Product>}
 */
export async function updateProduct(id, data) {
  requireSupabase()
  const slug = data.slug?.trim() || slugify(data.name || '')
  const row = productFormToRow({ ...data, slug })

  const { error } = await supabase.from('products').update(row).eq('id', id)
  if (error) throw friendlyWriteError(error)

  await syncVariants(id, data.sizes || [], indexVariantsBySize(data.variants))
  await syncProductImages(id, data.images || {})

  const updated = await getProduct(id)
  if (!updated) throw new Error('Product not found.')
  return updated
}

/**
 * Permanently deletes a product. `product_variants` and `product_images`
 * rows cascade automatically (FK `on delete cascade`), but Storage files
 * are a separate system Postgres cascades can't reach — so this looks up
 * every image's `storage_path` first and removes those files explicitly,
 * before deleting the product row, to avoid leaving orphaned files behind.
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteProduct(id) {
  requireSupabase()
  const { data: images, error: imgErr } = await supabase
    .from('product_images')
    .select('storage_path')
    .eq('product_id', id)
  if (imgErr) throw imgErr

  const paths = (images || []).map((row) => row.storage_path).filter(Boolean)
  if (paths.length) {
    await deleteProductImageFiles(paths)
  }

  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) throw error
  return true
}

/**
 * Duplicates a product. The copy always receives a brand-new id, SKU, and
 * slug, and is saved as a draft (never featured) so it can't collide with
 * or be mistaken for the original. Copied images reference the same
 * underlying Storage file (`image_url`, no `storage_path`) rather than
 * re-uploading — deliberately: if the copy's `storage_path` pointed at the
 * original's file, deleting the copy later would delete the original's
 * photo out from under it (see `deleteProduct`'s cleanup above).
 * @param {string} id
 * @returns {Promise<import('../data/products.js').Product>}
 */
export async function duplicateProduct(id) {
  requireSupabase()
  const original = await getProduct(id)
  if (!original) throw new Error('Product not found.')

  let suffix = 2
  let newSku = `${original.sku}-COPY`
  let newSlug = `${original.slug}-copy`
  let newProductNumber = `${original.productNumber}-COPY`
  for (;;) {
    const { count, error } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .or(`sku.eq.${newSku},slug.eq.${newSlug},product_number.eq.${newProductNumber}`)
    if (error) throw error
    if (!count) break
    newSku = `${original.sku}-COPY-${suffix}`
    newSlug = `${original.slug}-copy-${suffix}`
    newProductNumber = `${original.productNumber}-COPY-${suffix}`
    suffix += 1
  }

  const row = productFormToRow({
    ...original,
    sku: newSku,
    slug: newSlug,
    productNumber: newProductNumber,
    name: `${original.name} (Copy)`,
    status: 'draft',
    isFeatured: false,
  })

  const { data: inserted, error } = await supabase.from('products').insert(row).select('id').single()
  if (error) throw friendlyWriteError(error)

  const newId = inserted.id
  await syncVariants(newId, original.sizes || [], indexVariantsBySize(original.variants))

  const imageInserts = Object.entries(original.images || {})
    .filter(([, img]) => img.src)
    .map(([slot, img], index) => ({
      product_id: newId,
      image_type: slot,
      image_url: img.src,
      storage_path: null,
      alt_text: img.alt || '',
      sort_order: index,
    }))
  if (imageInserts.length) {
    const { error: imgErr } = await supabase.from('product_images').insert(imageInserts)
    if (imgErr) throw imgErr
  }

  const copy = await getProduct(newId)
  if (!copy) throw new Error('Product was duplicated but could not be reloaded.')
  return copy
}

/**
 * Sets the exact stock for one size of one product — used by both the
 * inline stock field on `AdminInventory` and the size/stock table inside
 * `ProductForm`. Upserts on `(product_id, size)`, so it works whether or
 * not a variant row already exists for that size.
 * @param {string} id
 * @param {string} size
 * @param {number} stock
 * @returns {Promise<import('../data/products.js').Product>}
 */
export async function updateInventory(id, size, stock) {
  requireSupabase()
  const clamped = Math.max(0, Math.round(Number(stock) || 0))
  const { error } = await supabase
    .from('product_variants')
    .upsert({ product_id: id, size, stock: clamped }, { onConflict: 'product_id,size' })
  if (error) throw error

  const updated = await getProduct(id)
  if (!updated) throw new Error('Product or size variant not found.')
  return updated
}
