import { getProductImagePublicUrl } from './supabase.js'

/**
 * Maps a Supabase `products` row (with `product_images` and
 * `product_variants` joined in) onto the exact `Product` shape the rest of
 * the app (ProductCard, Shop, Product page, admin) already expects from
 * `src/data/products.js`. This is the seam that lets every existing
 * component keep working unmodified regardless of which data source is
 * behind `src/services/products.js`.
 *
 * @param {object} row - a row from the `products` table with
 *   `product_images(*)` and `product_variants(*)` embedded
 * @returns {import('../data/products.js').Product}
 */
export function mapSupabaseProduct(row) {
  const images = buildImages(row.product_images || [])
  const variants = (row.product_variants || [])
    .map((v) => ({ size: v.size, stock: v.stock }))
    .sort((a, b) => sizeOrderIndex(a.size) - sizeOrderIndex(b.size))

  return {
    id: row.id,
    productNumber: row.product_number,
    sku: row.sku,
    name: row.name,
    slug: row.slug,
    price: Number(row.price),
    compareAtPrice: row.compare_at_price === null ? null : Number(row.compare_at_price),
    description: row.description || '',
    story: row.story || '',
    fabric: row.fabric || '',
    gsm: row.gsm ?? 0,
    fit: row.fit || '',
    construction: row.construction || '',
    design: row.design || '',
    care: row.care || '',
    stylingNote: row.styling_note || '',
    measurements: row.measurements || {},
    sizes: variants.map((v) => v.size),
    variants,
    images,
    category: row.category || '',
    tags: row.tags || [],
    isFeatured: !!row.is_featured,
    isNewArrival: !!row.is_new_arrival,
    status: row.status,
    createdAt: row.created_at,
    // Internal-only: kept so the admin layer can round-trip writes without
    // a second lookup. Not part of the Part 01–07 Product shape.
    _imageRows: row.product_images || [],
  }
}

const SIZE_ORDER = ['S', 'M', 'L', 'XL', 'XXL']
function sizeOrderIndex(size) {
  const i = SIZE_ORDER.indexOf(size)
  return i === -1 ? SIZE_ORDER.length : i
}

const KNOWN_SLOTS = ['main', 'front', 'back', 'model', 'detail', 'fabric']

/**
 * Builds the fixed six-slot `images` object the UI expects from a flat
 * image-row list. Each slot also carries `id`/`storagePath`/`sortOrder`
 * from the underlying `product_images` row — the storefront ignores these
 * (it only reads `src`/`alt`), but the admin product form needs them to
 * know which row to update/delete when a slot's file or alt text changes
 * (see `src/services/adminProducts.js`'s `syncProductImages`).
 */
function buildImages(imageRows) {
  const images = Object.fromEntries(
    KNOWN_SLOTS.map((slot) => [slot, { src: null, alt: '', id: null, storagePath: null, sortOrder: 0 }]),
  )
  for (const row of imageRows) {
    const slot = KNOWN_SLOTS.includes(row.image_type) ? row.image_type : null
    if (!slot) continue
    const src = row.image_url || getProductImagePublicUrl(row.storage_path)
    images[slot] = {
      src: src || null,
      alt: row.alt_text || '',
      id: row.id,
      storagePath: row.storage_path || null,
      sortOrder: row.sort_order ?? 0,
    }
  }
  return images
}
