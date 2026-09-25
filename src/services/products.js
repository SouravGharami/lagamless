import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { HOMEPAGE_FEATURED_LIMIT } from '../data/collections.js'
import { mapSupabaseProduct } from '../lib/mapSupabaseProduct.js'
import {
  getPublishedProducts,
  getFeaturedProducts as getFeaturedLocal,
  getHomepageTees as getHomepageTeesLocal,
  getCollectionTees as getCollectionTeesLocal,
  getCategories as getCategoriesLocal,
  getAllSizes as getAllSizesLocal,
} from '../data/products.js'

/**
 * Product service — the seam between the UI (Shop, Product, ProductCard,
 * homepage) and the data source.
 *
 * Part 08A: backed by Supabase (`products` + `product_images` +
 * `product_variants`) when `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`
 * are configured. Falls back to the local in-memory catalog
 * (`src/data/products.js`) when they are not, or if a Supabase query
 * fails — so the project keeps running out of the box, and one bad
 * network call never leaves the storefront blank. See supabase/SETUP.md.
 *
 * Every function keeps the exact signature and return shape it had in
 * Part 07, so no page or component needed to change. `mapSupabaseProduct`
 * is what guarantees this: it always returns the full `Product` shape
 * (see `src/data/products.js`) with every key present, defaulting any
 * field that wasn't selected for a given query to the same empty value
 * (`''`, `0`, `{}`, an empty image slot, ...) it would use for a genuinely
 * blank field. So requesting fewer columns for the storefront views below
 * changes what data is *populated*, never the *shape* every existing
 * component already expects.
 *
 * ============================================================================
 * PERFORMANCE OPTIMIZATION PASS 01 — what changed and why
 * ============================================================================
 *
 * 1. Explicit column lists instead of `select('*, product_images(*),
 *    product_variants(*)')`. The storefront card/list views (Shop,
 *    FeaturedProducts, related products) only ever render a handful of
 *    fields (see ProductCard.jsx) — the old broad select downloaded every
 *    detail field (description, story, fabric, measurements, ...) and
 *    every gallery image slot for every product in a list, every time.
 * 2. Card-shaped queries (`getAllProducts`, `getFeaturedProducts`,
 *    `getRelatedProducts`) also filter the embedded `product_images` rows
 *    down to the three slots a card actually shows (`main`, `model`,
 *    `back`) via a PostgREST embedded filter (`.in('product_images.image_type',
 *    CARD_IMAGE_SLOTS)`). This is a LEFT-join filter (no `!inner`), so a
 *    product with none of those three slots filled in still comes back
 *    normally — it just renders its placeholder, exactly as it did before.
 * 3. `getProductBySlug` (the Product Details page) keeps every detail
 *    field and all six gallery slots — that page genuinely needs them —
 *    but still replaced `select('*')` with an explicit list, so it's not
 *    silently coupled to every future column added to `products`.
 * 4. A small in-memory, TTL-based cache (`CACHE_TTL_MS` below) avoids
 *    repeating an identical storefront read within the same browser
 *    session — e.g. Shop → Product A → back to Shop within a minute no
 *    longer refetches the whole catalog. See `getOrFetch`/
 *    `invalidateProductCache` below for exactly what is and isn't cached.
 */

const CACHE_TTL_MS = 60_000

/**
 * @type {Map<string, { promise: Promise<any>, expiresAt: number }>}
 *
 * Deliberately module-scoped (not per-component) — this is a read cache
 * for public, published-catalog data only:
 *   - Storefront reads (`getAllProducts`, `getProductBySlug`,
 *     `getFeaturedProducts`, `getRelatedProducts`, `getCategories`,
 *     `getAllSizes`) only. Nothing in `src/services/adminProducts.js` or
 *     any authenticated/private read (profiles, orders, ...) ever touches
 *     this cache.
 *   - Keyed by the exact query shape (e.g. `slug:${slug}`), so different
 *     products/counts never collide.
 *   - Caches the in-flight *promise*, not just the resolved value, so
 *     concurrent calls for the same key (e.g. two components mounting at
 *     once) share one network request instead of firing two.
 *   - A rejected fetch is evicted immediately (see `getOrFetch`) so a
 *     transient failure can never "poison" the cache — the very next call
 *     retries for real instead of replaying the same error for 60s.
 *   - `invalidateProductCache()` is called by every admin write
 *     (`src/services/adminProducts.js`) so a product an admin just
 *     published/edited/deleted shows up on the storefront immediately,
 *     never stale for up to a minute.
 */
const cache = new Map()

function getOrFetch(key, fetcher) {
  const now = Date.now()
  const entry = cache.get(key)
  if (entry && entry.expiresAt > now) {
    return entry.promise
  }
  const promise = fetcher().catch((err) => {
    // Never cache a failure — the next call should get a real retry, not
    // a replayed rejection for the rest of the TTL window.
    if (cache.get(key)?.promise === promise) cache.delete(key)
    throw err
  })
  cache.set(key, { promise, expiresAt: now + CACHE_TTL_MS })
  return promise
}

/**
 * Clears every cached storefront read. Call this after any write that
 * could change what the storefront should show (create/update/delete a
 * product, change stock, change images) — see
 * `src/services/adminProducts.js`. Cheap and safe to call more often than
 * strictly necessary; it only ever costs one extra network round-trip on
 * the next storefront read.
 */
export function invalidateProductCache() {
  cache.clear()
}

// ---------------------------------------------------------------------------
// Column lists
// ---------------------------------------------------------------------------

/** Everything ProductCard.jsx (and the filter/search/sort helpers it feeds) actually reads. */
const CARD_PRODUCT_COLUMNS = [
  'id',
  'product_number',
  'sku',
  'name',
  'slug',
  'price',
  'compare_at_price',
  'category',
  'tags',
  'collections',
  'is_featured',
  'is_new_arrival',
  'status',
  'created_at',
].join(', ')

/** Card/list views only ever render these three slots (see ProductCard.jsx). */
const CARD_IMAGE_SLOTS = ['main', 'model', 'back']

const IMAGE_COLUMNS = 'id, product_id, image_url, storage_path, image_type, alt_text, sort_order'
const VARIANT_COLUMNS = 'size, stock'
const COLOR_COLUMNS = 'id, name, hex_code, sort_order'

const CARD_SELECT = `${CARD_PRODUCT_COLUMNS}, product_images(${IMAGE_COLUMNS}), product_variants(${VARIANT_COLUMNS}), product_colors(${COLOR_COLUMNS})`

/** Full field set the Product Details page (and its accordions/DNA section) reads — see Product.jsx. */
const DETAIL_PRODUCT_COLUMNS = [
  'id',
  'product_number',
  'sku',
  'name',
  'slug',
  'price',
  'compare_at_price',
  'description',
  'story',
  'fabric',
  'gsm',
  'fit',
  'construction',
  'design',
  'care',
  'styling_note',
  'measurements',
  'category',
  'tags',
  'collections',
  'is_featured',
  'is_new_arrival',
  'status',
  'created_at',
].join(', ')

// The detail page supports all six gallery slots (main/front/back/model/
// detail/fabric) — see GALLERY_ORDER in Product.jsx — so, unlike the card
// queries above, its image embed is intentionally unfiltered.
const DETAIL_SELECT = `${DETAIL_PRODUCT_COLUMNS}, product_images(${IMAGE_COLUMNS}), product_variants(${VARIANT_COLUMNS}), product_colors(${COLOR_COLUMNS})`

/**
 * Applies the card-view image-slot filter to a query builder. Uses a
 * plain (non-`!inner`) embedded filter, so it only trims which
 * `product_images` rows come back nested under each product — it never
 * excludes a product that happens to have none of these three slots
 * filled in (that product still comes back, just with an empty `images`
 * object and a placeholder card, same as before this optimization).
 */
function withCardImageFilter(query) {
  return query.in('product_images.image_type', CARD_IMAGE_SLOTS)
}

// ---------------------------------------------------------------------------

/** @returns {Promise<import('../data/products.js').Product[]>} */
export async function getAllProducts() {
  return getOrFetch('all', async () => {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await withCardImageFilter(
          supabase.from('products').select(CARD_SELECT).eq('status', 'published'),
        ).order('created_at', { ascending: false })
        if (error) throw error
        return data.map(mapSupabaseProduct)
      } catch (err) {
        console.error('getAllProducts: Supabase query failed, using local catalog.', err)
      }
    }
    return getPublishedProducts()
  })
}

/**
 * @param {string} slug
 * @returns {Promise<import('../data/products.js').Product | undefined>}
 */
export async function getProductBySlug(slug) {
  return getOrFetch(`slug:${slug}`, async () => {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('products')
          .select(DETAIL_SELECT)
          .eq('status', 'published')
          .eq('slug', slug)
          .maybeSingle()
        if (error) throw error
        return data ? mapSupabaseProduct(data) : undefined
      } catch (err) {
        console.error('getProductBySlug: Supabase query failed, using local catalog.', err)
      }
    }
    return getPublishedProducts().find((p) => p.slug === slug)
  })
}

/**
 * @param {number} [count]
 * @returns {Promise<import('../data/products.js').Product[]>}
 */
export async function getFeaturedProducts(count = 4) {
  return getOrFetch(`featured:${count}`, async () => {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await withCardImageFilter(
          supabase.from('products').select(CARD_SELECT).eq('status', 'published'),
        )
          .order('is_featured', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(count)
        if (error) throw error
        return data.map(mapSupabaseProduct)
      } catch (err) {
        console.error('getFeaturedProducts: Supabase query failed, using local catalog.', err)
      }
    }
    return getFeaturedLocal(count)
  })
}

/**
 * "Featured Tees" on the homepage — exactly the published products an admin
 * ticked "Show in Featured Tees" on (`is_featured`), newest first. Nothing
 * is added automatically: an untagged product never appears here, and if
 * nothing is tagged the homepage section hides itself (see
 * FeaturedProducts.jsx).
 *
 * `getFeaturedProducts` above is untouched and still used by anything that
 * wants a "featured first, then the rest" list.
 *
 * @param {number} [count]
 * @returns {Promise<import('../data/products.js').Product[]>}
 */
export async function getHomepageProducts(count = HOMEPAGE_FEATURED_LIMIT) {
  return getOrFetch(`homepage-featured:${count}`, async () => {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await withCardImageFilter(
          supabase
            .from('products')
            .select(CARD_SELECT)
            .eq('status', 'published')
            .eq('is_featured', true),
        )
          .order('created_at', { ascending: false })
          .limit(count)
        if (error) throw error
        return data.map(mapSupabaseProduct)
      } catch (err) {
        console.error('getHomepageProducts: Supabase query failed, using local catalog.', err)
      }
    }
    return getHomepageTeesLocal(count)
  })
}

/**
 * Products tagged with a given homepage/Shop "store placement" collection
 * (Admin → Add / Edit product → Where this product appears → e.g. "Durga
 * Puja Collection"), newest first. Nothing is added automatically: an
 * untagged product never appears, and if nothing is tagged the caller gets
 * back an empty array and should hide its section (see CultureManifesto.jsx,
 * which uses this for the "Tradition Meets Today" banner).
 *
 * `collections` is stored as a Postgres `text[]`, so this uses PostgREST's
 * `contains` filter (`collections @> {slug}`) to do the match in the
 * database rather than pulling every product down and filtering client-side.
 *
 * @param {string} slug    a slug from src/data/collections.js (e.g. 'durga-puja')
 * @param {number} [count]
 * @returns {Promise<import('../data/products.js').Product[]>}
 */
export async function getCollectionProducts(slug, count = 8) {
  return getOrFetch(`collection:${slug}:${count}`, async () => {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await withCardImageFilter(
          supabase
            .from('products')
            .select(CARD_SELECT)
            .eq('status', 'published')
            .contains('collections', [slug]),
        )
          .order('created_at', { ascending: false })
          .limit(count)
        if (error) throw error
        return data.map(mapSupabaseProduct)
      } catch (err) {
        console.error('getCollectionProducts: Supabase query failed, using local catalog.', err)
      }
    }
    return getCollectionTeesLocal(slug, count)
  })
}

/**
 * Products related to a given product — same category, excluding itself.
 * Secondary content: called by Product.jsx only *after* the main product
 * has already rendered (see the `requestIdleCallback` scheduling there),
 * so this never delays the main product becoming usable.
 * @param {import('../data/products.js').Product} product
 * @param {number} [count]
 * @returns {Promise<import('../data/products.js').Product[]>}
 */
export async function getRelatedProducts(product, count = 4) {
  return getOrFetch(`related:${product.id}:${product.category}:${count}`, async () => {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await withCardImageFilter(
          supabase
            .from('products')
            .select(CARD_SELECT)
            .eq('status', 'published')
            .eq('category', product.category)
            .neq('id', product.id),
        ).limit(count)
        if (error) throw error
        return data.map(mapSupabaseProduct)
      } catch (err) {
        console.error('getRelatedProducts: Supabase query failed, using local catalog.', err)
      }
    }
    const related = getPublishedProducts().filter(
      (p) => p.category === product.category && p.id !== product.id,
    )
    return related.slice(0, count)
  })
}

/** @returns {Promise<string[]>} */
export async function getCategories() {
  return getOrFetch('categories', async () => {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('category')
          .eq('status', 'published')
        if (error) throw error
        const seen = new Set()
        const categories = []
        for (const row of data) {
          if (row.category && !seen.has(row.category)) {
            seen.add(row.category)
            categories.push(row.category)
          }
        }
        return categories
      } catch (err) {
        console.error('getCategories: Supabase query failed, using local catalog.', err)
      }
    }
    return getCategoriesLocal()
  })
}

/** @returns {Promise<string[]>} */
export async function getAllSizes() {
  return getOrFetch('sizes', async () => {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('product_variants')
          .select('size, products!inner(status)')
          .eq('products.status', 'published')
        if (error) throw error
        const order = ['S', 'M', 'L', 'XL', 'XXL']
        const present = new Set(data.map((row) => row.size))
        return order.filter((size) => present.has(size))
      } catch (err) {
        console.error('getAllSizes: Supabase query failed, using local catalog.', err)
      }
    }
    return getAllSizesLocal()
  })
}
