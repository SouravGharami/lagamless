import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { mapSupabaseProduct } from '../lib/mapSupabaseProduct.js'
import { invalidateProductCache } from './products.js'
import {
  uploadProductImage,
  saveProductImageRecord,
  updateProductImageRecord,
  deleteProductImageRecord,
  deleteProductImageFiles,
} from './productImages.js'
import { slugify } from '../lib/slugify.js'
import { ensureGarmentMask, deleteGarmentMasks } from './garmentMasks.js'

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
 * PERFORMANCE OPTIMIZATION PASS 01: every write function below calls
 * `invalidateProductCache()` (from `src/services/products.js`) after it
 * succeeds, so a product an admin just created/edited/deleted/restocked
 * shows up on the storefront immediately instead of waiting out that
 * cache's TTL. This file's own reads (`getProducts`/`getProduct`) are
 * deliberately NOT cached — the admin panel must always see the current
 * database state, including drafts and everything else the storefront
 * cache never even fetches.
 *
 * The admin panel is the one place allowed to see draft products too —
 * every list/read function here queries without a `status` filter. The
 * storefront-facing `src/services/products.js` is untouched and still
 * only ever selects `status = 'published'`.
 */

const ADMIN_PRODUCT_SELECT = '*, product_images(*), product_variants(*), product_colors(*)'
const IMAGE_SLOT_ORDER = ['main', 'front', 'model', 'side', 'back', 'three_quarter_back', 'detail', 'fabric']

/** Human labels for error messages — same wording as the admin form's slot labels. */
const IMAGE_SLOT_LABELS = {
  main: 'Main',
  front: 'Front',
  model: '3/4 Front',
  side: 'Side',
  back: 'Back',
  three_quarter_back: '3/4 Back',
  detail: 'Detail',
  fabric: 'Fabric',
}

function requireSupabase() {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see supabase/SETUP.md) before using the admin panel.',
    )
  }
}

/** Turns a Postgres unique-violation into a message naming the field, where recognizable. */
function friendlyWriteError(error) {
  // The `collections` column comes from supabase/part-11-product-collections.sql.
  // If it hasn't been run yet, say exactly what to do instead of a raw DB error.
  if (/collections/i.test(error?.message || '') && (error?.code === 'PGRST204' || error?.code === '42703')) {
    return new Error(
      'The database is missing the "collections" column. In Supabase → SQL Editor, run supabase/part-11-product-collections.sql, then save again.',
    )
  }
  if (
    /product_colors/i.test(error?.message || '') &&
    ['PGRST204', 'PGRST205', '42703', '42P01'].includes(error?.code)
  ) {
    return new Error(
      'The database is missing the "product_colors" table. In Supabase → SQL Editor, run supabase/part-12-product-colors.sql, then save again.',
    )
  }
  if (/mockup_config/i.test(error?.message || '') && (error?.code === 'PGRST204' || error?.code === '42703')) {
    return new Error(
      'The database is missing the "mockup_config" column. In Supabase → SQL Editor, run supabase/part-13-mockup-config.sql, then save again.',
    )
  }
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
    // Print Placement & Mockup Studio (Part 13) — null until the studio's
    // "Generate mockups" has been used at least once on this product.
    mockup_config: data.mockupConfig || null,
    category: data.category?.trim() || '',
    tags: data.tags || [],
    collections: Array.isArray(data.collections) ? [...new Set(data.collections)] : [],
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
async function syncProductImages(productId, images, baseColorHex = null) {
  // One slot failing (a rejected upload, a DB constraint, a network blip) must NEVER stop the slots after it —
  // that is exactly how "only the first three photos saved" happened: slot 4 threw, the loop aborted, and slots
  // 5-8 were never even attempted. So each slot is saved independently and failures are collected and reported.
  const failures = []

  // Fixed, predictable order (Main, Front, 3/4 Front, Side, Back, 3/4 Back, Detail, Fabric), then any extras.
  const entries = Object.entries(images || {}).sort(([a], [b]) => {
    const ia = IMAGE_SLOT_ORDER.indexOf(a)
    const ib = IMAGE_SLOT_ORDER.indexOf(b)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })

  for (const [slotKey, slot] of entries) {
    if (!slot) continue
    const orderIndex = IMAGE_SLOT_ORDER.indexOf(slotKey)
    const sortOrder = orderIndex === -1 ? 0 : orderIndex

    try {
      if (slot.removed) {
        if (slot.id) {
          if (slot.storagePath) {
            await deleteProductImageFiles([slot.storagePath])
            await deleteGarmentMasks([slot.storagePath])
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
            imageType: slotKey,
          })
          if (oldPath && oldPath !== storagePath) {
            await deleteProductImageFiles([oldPath])
            await deleteGarmentMasks([oldPath])
          }
        } else {
          try {
            // A slot with no known row id may still HAVE a row (a previous save got this far before another slot
            // failed). Reuse it instead of inserting a duplicate, so retrying a save is always safe.
            const { data: existingRow, error: lookupError } = await supabase
              .from('product_images')
              .select('id, storage_path')
              .eq('product_id', productId)
              .eq('image_type', slotKey)
              .order('created_at', { ascending: true })
              .limit(1)
              .maybeSingle()
            if (lookupError) throw lookupError
            if (existingRow) {
              await updateProductImageRecord(existingRow.id, {
                storagePath,
                imageUrl: publicUrl,
                altText: slot.alt || '',
                sortOrder,
              })
              if (existingRow.storage_path && existingRow.storage_path !== storagePath) {
                await deleteProductImageFiles([existingRow.storage_path]).catch(() => {})
                await deleteGarmentMasks([existingRow.storage_path])
              }
            } else {
              await saveProductImageRecord(productId, slotKey, {
                storagePath,
                imageUrl: publicUrl,
                altText: slot.alt || '',
                sortOrder,
              })
            }
          } catch (recordError) {
            // The file went up but its database row didn't — don't leave an orphaned file behind.
            await deleteProductImageFiles([storagePath]).catch(() => {})
            throw recordError
          }
        }
        // This photo's own garment mask (ensureGarmentMask never throws, so it can't fail the slot).
        await ensureGarmentMask({ slotKey, storagePath, src: publicUrl, pendingFile: slot.pendingFile, baseColorHex })
        continue
      }

      if (slot.id && slot.src) {
        // No file change — keep alt text / slot order in sync with any edits.
        await updateProductImageRecord(slot.id, { altText: slot.alt || '', sortOrder, imageType: slotKey })
        // Photos saved before per-photo masks existed get theirs on their next save.
        await ensureGarmentMask({ slotKey, storagePath: slot.storagePath, src: slot.src, pendingFile: null, baseColorHex })
      }
    } catch (error) {
      console.error(`[product-images] "${slotKey}" failed to save:`, error)
      failures.push({ slotKey, label: IMAGE_SLOT_LABELS[slotKey] || slotKey, error })
    }
  }

  return failures
}

/** Turns collected per-slot failures into one clear, actionable message. */
function describeImageFailures(failures, productWasCreated) {
  const names = failures.map((f) => f.label).join(', ')
  const constraint = failures.some((f) => f.error?.code === '23514' || /image_type_check|violates check constraint/i.test(f.error?.message || ''))
  const detail = failures[0]?.error?.message ? ` (${failures[0].error.message})` : ''
  const fix = constraint
    ? ' The database does not accept these image slots yet — in Supabase → SQL Editor, run supabase/part-34-product-image-slots.sql, then re-choose those photos here and press Save again.'
    : ' Re-choose those photos in this product\'s Image section and press Save again.'
  return `${productWasCreated ? 'The product was saved, but' : 'The product details were saved, but'} these photos could not be saved: ${names}${detail}.${fix}`
}

/**
 * Reconciles `product_colors` for one product against a desired
 * `{name, hex}[]` list, the same delete-then-upsert pattern as
 * `syncVariants` above, keyed by `name` instead of `size`. Renaming a
 * color in the admin form is a delete-old + insert-new (there's no
 * stable id to upsert against once the name — the unique key — changes),
 * everything else is an upsert keyed on `(product_id, name)`.
 *
 * `sort_order` is always rewritten to the array's current index, so
 * reordering colors in the form (drag, or remove-then-readd) is
 * reflected without any separate "move" operation.
 */
async function syncColors(productId, colors) {
  const { data: existing, error } = await supabase
    .from('product_colors')
    .select('id, name')
    .eq('product_id', productId)
  if (error) throw error

  const desired = new Set((colors || []).map((c) => c.name.trim()))
  const toDelete = (existing || []).filter((c) => !desired.has(c.name))
  if (toDelete.length) {
    const { error: delErr } = await supabase
      .from('product_colors')
      .delete()
      .in('id', toDelete.map((c) => c.id))
    if (delErr) throw delErr
  }

  if (colors && colors.length) {
    const upserts = colors.map((c, index) => ({
      product_id: productId,
      name: c.name.trim(),
      hex_code: c.hex,
      sort_order: index,
    }))
    const { error: upErr } = await supabase
      .from('product_colors')
      .upsert(upserts, { onConflict: 'product_id,name' })
    if (upErr) throw upErr
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
  const imageFailures = await syncProductImages(productId, data.images || {}, data.colors?.[0]?.hex ?? null)
  await syncColors(productId, data.colors || [])
  if (imageFailures.length) {
    // The product row exists now, so the storefront cache must reflect it, and the caller must know its id
    // (retrying "create" would hit the duplicate SKU/slug check instead of just retrying the photos).
    invalidateProductCache()
    const err = new Error(describeImageFailures(imageFailures, true))
    err.productId = productId
    throw err
  }

  const created = await getProduct(productId)
  if (!created) throw new Error('Product was created but could not be reloaded.')
  // A newly published/drafted product must show up on the storefront
  // immediately, not up to CACHE_TTL_MS later — see products.js.
  invalidateProductCache()
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
  const imageFailures = await syncProductImages(id, data.images || {}, data.colors?.[0]?.hex ?? null)
  await syncColors(id, data.colors || [])
  if (imageFailures.length) {
    invalidateProductCache()
    throw new Error(describeImageFailures(imageFailures, false))
  }

  const updated = await getProduct(id)
  if (!updated) throw new Error('Product not found.')
  invalidateProductCache()
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

  // Step 5-5: gallery mockups cascade in Postgres too, but their files (final renders + stored sources, all under
  // mockups/<id>/) are Storage objects the cascade can't reach. Read before the product row is deleted.
  const { data: mockups } = await supabase.from('product_mockups').select('image_path, source_paths').eq('product_id', id)
  const mockupPaths = (mockups || []).flatMap((m) => [m.image_path, ...(m.source_paths || [])]).filter((p) => p?.startsWith(`mockups/${id}/`))

  const photoPaths = (images || []).map((row) => row.storage_path).filter(Boolean)
  const paths = [...photoPaths, ...mockupPaths]
  if (paths.length) {
    await deleteProductImageFiles(paths)
    await deleteGarmentMasks(photoPaths)
  }

  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) throw error
  invalidateProductCache()
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
  await syncColors(newId, original.colors || [])

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
  invalidateProductCache()
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
  // Stock changes affect storefront availability badges/sold-out state —
  // must be reflected immediately, not after the cache TTL.
  invalidateProductCache()
  return updated
}
