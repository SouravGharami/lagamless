/**
 * Product data — seed/reference catalog + local fallback (Part 08A).
 *
 * As of Part 08A, `src/services/products.js` (the storefront's real data
 * source) queries Supabase directly when `VITE_SUPABASE_URL`/
 * `VITE_SUPABASE_ANON_KEY` are configured (see supabase/SETUP.md) — this
 * file is no longer the primary source of truth for the storefront in
 * that case. This file still serves two purposes:
 *
 *   1. It is the source `supabase/seed.sql` was written from, so the
 *      Supabase catalog matches this one exactly once seeded.
 *   2. It remains the *fallback* the storefront service layer uses when
 *      Supabase isn't configured (or a query fails), and it is still the
 *      catalog the admin panel and the cart's client-side stock checks
 *      operate on in this part (admin auth — required for real Supabase
 *      writes — doesn't exist until Part 08B; see BUILD_STATUS.md).
 *
 * Every field here is named and shaped to map cleanly onto the Postgres
 * tables in `supabase/schema.sql` (`products`, `product_variants`,
 * `product_images`), so the two stay in sync by construction.
 *
 * @typedef {Object} ImageSlot
 * @property {string|null} src
 * @property {string} alt
 *
 * @typedef {Object} ProductImages
 * @property {ImageSlot} main    - primary catalog/grid image
 * @property {ImageSlot} front   - full front-facing shot
 * @property {ImageSlot} back    - full back-facing shot
 * @property {ImageSlot} model   - on-model / lifestyle shot
 * @property {ImageSlot} detail  - close-up construction/hardware detail
 * @property {ImageSlot} fabric  - close-up fabric texture
 *
 * @typedef {Object} Variant
 * @property {string} size
 * @property {number} stock
 *
 * @typedef {Object} Measurement
 * @property {number} chest    - inches
 * @property {number} length   - inches
 * @property {number} shoulder - inches
 *
 * @typedef {Object} Product
 * @property {string} id
 * @property {string} productNumber - display catalog number, e.g. "LAGAMLESS 001"
 * @property {string} sku
 * @property {string} name
 * @property {string} slug
 * @property {number} price - price in rupees
 * @property {number|null} compareAtPrice - pre-discount price in rupees, if on sale
 * @property {string} description - short marketing description
 * @property {string} story - longer editorial/brand story copy
 * @property {string} fabric
 * @property {number} gsm
 * @property {string} fit
 * @property {string} [construction] - build/stitching notes for Product DNA
 * @property {string} [design] - one- or two-sentence design-intent note
 * @property {string} [care] - care instructions; falls back to a generic line if absent
 * @property {string} [stylingNote] - short "how to wear it" line for the Styling section
 * @property {Record<string, Measurement>} measurements - keyed by size
 * @property {string[]} sizes - explicit list, in display order
 * @property {Variant[]} variants - per-size stock
 * @property {ProductImages} images
 * @property {string} category
 * @property {string[]} tags
 * @property {boolean} isFeatured
 * @property {boolean} isNewArrival
 * @property {'published'|'draft'} status
 * @property {string} createdAt - ISO date, used for "Newest" sorting
 */

function emptyImage(alt) {
  return { src: null, alt }
}

/** @type {Product[]} */
export const PRODUCTS = [
  {
    id: '1',
    productNumber: 'LAGAMLESS 001',
    sku: 'LGML-001-INK',
    name: 'Oversized Tee — Ink',
    slug: 'lagamless-001',
    price: 1799,
    compareAtPrice: null,
    description: 'A heavyweight oversized tee cut for drape, not shrink.',
    story:
      'Built around a dropped shoulder and a boxier body than a standard tee, this is the piece the rest of the line is measured against. Garment-washed once for a lived-in hand-feel from the first wear.',
    fabric: '240 GSM combed cotton, garment-dyed',
    gsm: 240,
    fit: 'Oversized',
    construction: 'Single jersey knit, tubular body, double-stitched hems throughout.',
    design: 'Zero branding on the face — the dropped shoulder line is the only signature.',
    care: 'Machine wash cold, inside out. Do not bleach. Tumble dry low. Warm iron if needed.',
    stylingNote: 'Worn oversized on purpose — let it sit past the hip and cuff the sleeve once.',
    measurements: {
      S: { chest: 44, length: 27, shoulder: 21 },
      M: { chest: 46, length: 28, shoulder: 22 },
      L: { chest: 48, length: 29, shoulder: 23 },
      XL: { chest: 50, length: 30, shoulder: 24 },
    },
    sizes: ['S', 'M', 'L', 'XL'],
    variants: [
      { size: 'S', stock: 6 },
      { size: 'M', stock: 12 },
      { size: 'L', stock: 9 },
      { size: 'XL', stock: 0 },
    ],
    images: {
      main: emptyImage('LAGAMLESS 001 Oversized Tee in Ink, front view'),
      front: emptyImage('LAGAMLESS 001 Oversized Tee, full front'),
      back: emptyImage('LAGAMLESS 001 Oversized Tee, full back'),
      model: emptyImage('Model wearing LAGAMLESS 001 Oversized Tee'),
      detail: emptyImage('LAGAMLESS 001 neckline and stitch detail'),
      fabric: emptyImage('LAGAMLESS 001 fabric close-up'),
    },
    category: 'Tees',
    tags: ['tee', 'oversized', 'cotton', 'essentials'],
    isFeatured: true,
    isNewArrival: true,
    status: 'published',
    createdAt: '2026-08-20',
  },
  {
    id: '2',
    productNumber: 'LAGAMLESS 002',
    sku: 'LGML-002-CHR',
    name: 'Boxy Hoodie — Charcoal',
    slug: 'lagamless-002',
    price: 3499,
    compareAtPrice: 3999,
    description: 'A dropped, boxy hoodie in brushed fleece with a heavy hand.',
    story:
      'Cut wide across the body and short in the sleeve-to-hem ratio on purpose, this hoodie is built to layer. The hood is unlined for a cleaner silhouette when it is down.',
    fabric: '380 GSM brushed-back fleece, cotton-poly',
    gsm: 380,
    fit: 'Boxy',
    construction: 'Loopback fleece body, flat-seamed set-in sleeve, unlined hood.',
    design: 'A dropped, boxy block built to layer without adding bulk.',
    care: 'Machine wash cold with like colors. Do not bleach. Tumble dry low. Do not iron print areas.',
    stylingNote: 'Layer over a boxy tee and let the hood sit flat and unstructured.',
    measurements: {
      S: { chest: 46, length: 25, shoulder: 23 },
      M: { chest: 48, length: 26, shoulder: 24 },
      L: { chest: 50, length: 27, shoulder: 25 },
      XL: { chest: 52, length: 28, shoulder: 26 },
    },
    sizes: ['S', 'M', 'L', 'XL'],
    variants: [
      { size: 'S', stock: 3 },
      { size: 'M', stock: 5 },
      { size: 'L', stock: 4 },
      { size: 'XL', stock: 2 },
    ],
    images: {
      main: emptyImage('LAGAMLESS 002 Boxy Hoodie in Charcoal, front view'),
      front: emptyImage('LAGAMLESS 002 Boxy Hoodie, full front'),
      back: emptyImage('LAGAMLESS 002 Boxy Hoodie, full back'),
      model: emptyImage('Model wearing LAGAMLESS 002 Boxy Hoodie'),
      detail: emptyImage('LAGAMLESS 002 drawcord and pocket detail'),
      fabric: emptyImage('LAGAMLESS 002 fleece close-up'),
    },
    category: 'Hoodies',
    tags: ['hoodie', 'boxy', 'fleece', 'new'],
    isFeatured: true,
    isNewArrival: true,
    status: 'published',
    createdAt: '2026-08-25',
  },
  {
    id: '3',
    productNumber: 'LAGAMLESS 003',
    sku: 'LGML-003-BNE',
    name: 'Drop-Shoulder Shirt — Bone',
    slug: 'lagamless-003',
    price: 2299,
    compareAtPrice: null,
    description: 'A relaxed woven shirt with a dropped shoulder seam.',
    story:
      'Midweight cotton poplin with enough structure to hold its shape open or buttoned to the top. The dropped shoulder seam is the only detail doing the work here.',
    fabric: '150 GSM cotton poplin',
    gsm: 150,
    fit: 'Relaxed',
    construction: 'Single-needle stitched yoke, dropped shoulder seam, corozo-style buttons.',
    design: 'One deliberate detail — the dropped shoulder seam — carries the whole shirt.',
    care: 'Machine wash cold. Do not bleach. Hang dry. Warm iron if needed.',
    stylingNote: 'Wear it open over a plain tee, or buttoned to the top and untucked.',
    measurements: {
      S: { chest: 45, length: 28, shoulder: 22 },
      M: { chest: 47, length: 29, shoulder: 23 },
      L: { chest: 49, length: 30, shoulder: 24 },
    },
    sizes: ['S', 'M', 'L'],
    variants: [
      { size: 'S', stock: 4 },
      { size: 'M', stock: 0 },
      { size: 'L', stock: 3 },
    ],
    images: {
      main: emptyImage('LAGAMLESS 003 Drop-Shoulder Shirt in Bone, front view'),
      front: emptyImage('LAGAMLESS 003 shirt, full front'),
      back: emptyImage('LAGAMLESS 003 shirt, full back'),
      model: emptyImage('Model wearing LAGAMLESS 003 shirt'),
      detail: emptyImage('LAGAMLESS 003 collar and button detail'),
      fabric: emptyImage('LAGAMLESS 003 poplin close-up'),
    },
    category: 'Shirts',
    tags: ['shirt', 'woven', 'relaxed'],
    isFeatured: false,
    isNewArrival: false,
    status: 'published',
    createdAt: '2026-06-10',
  },
  {
    id: '4',
    productNumber: 'LAGAMLESS 004',
    sku: 'LGML-004-STN',
    name: 'Cargo Pant — Stone',
    slug: 'lagamless-004',
    price: 2999,
    compareAtPrice: null,
    description: 'A tapered cargo pant with utility pockets and a clean leg line.',
    story:
      'Six-pocket construction on a tapered leg, so the utility detailing does not fight the silhouette. Finished with an adjustable internal waist tab.',
    fabric: '260 GSM cotton twill',
    gsm: 260,
    fit: 'Tapered',
    construction: 'Six-pocket cargo build, bar-tacked stress points, adjustable internal waist tab.',
    design: 'Utility pocketing kept low-profile so it never fights the tapered leg line.',
    care: 'Machine wash cold, inside out. Do not bleach. Tumble dry low.',
    stylingNote: 'Break the leg with a chunky boot and keep the top half boxy and simple.',
    measurements: {
      S: { chest: 32, length: 40, shoulder: 0 },
      M: { chest: 34, length: 41, shoulder: 0 },
      L: { chest: 36, length: 42, shoulder: 0 },
      XL: { chest: 38, length: 43, shoulder: 0 },
    },
    sizes: ['S', 'M', 'L', 'XL'],
    variants: [
      { size: 'S', stock: 5 },
      { size: 'M', stock: 7 },
      { size: 'L', stock: 6 },
      { size: 'XL', stock: 1 },
    ],
    images: {
      main: emptyImage('LAGAMLESS 004 Cargo Pant in Stone, front view'),
      front: emptyImage('LAGAMLESS 004 cargo pant, full front'),
      back: emptyImage('LAGAMLESS 004 cargo pant, full back'),
      model: emptyImage('Model wearing LAGAMLESS 004 cargo pant'),
      detail: emptyImage('LAGAMLESS 004 pocket and hardware detail'),
      fabric: emptyImage('LAGAMLESS 004 twill close-up'),
    },
    category: 'Bottoms',
    tags: ['pants', 'cargo', 'twill'],
    isFeatured: true,
    isNewArrival: false,
    status: 'published',
    createdAt: '2026-05-02',
  },
  {
    id: '5',
    productNumber: 'LAGAMLESS 005',
    sku: 'LGML-005-BLK',
    name: 'Boxy Tee — Black',
    slug: 'lagamless-005',
    price: 1699,
    compareAtPrice: null,
    description: 'The everyday boxy tee. Squared hem, dropped shoulder.',
    story:
      'A tighter, everyday cousin of LAGAMLESS 001 — same dropped shoulder logic, slightly less volume, built to be the base layer under a hoodie or shirt.',
    fabric: '220 GSM combed cotton',
    gsm: 220,
    fit: 'Boxy',
    construction: 'Single jersey knit, tubular body, taped neck seam.',
    design: 'A tighter, everyday cut of the same dropped-shoulder logic as LAGAMLESS 001.',
    care: 'Machine wash cold, inside out. Do not bleach. Tumble dry low.',
    stylingNote: 'Built as a base layer — tuck it under a hoodie or an open shirt.',
    measurements: {
      S: { chest: 42, length: 26, shoulder: 20 },
      M: { chest: 44, length: 27, shoulder: 21 },
      L: { chest: 46, length: 28, shoulder: 22 },
      XL: { chest: 48, length: 29, shoulder: 23 },
    },
    sizes: ['S', 'M', 'L', 'XL'],
    variants: [
      { size: 'S', stock: 10 },
      { size: 'M', stock: 14 },
      { size: 'L', stock: 11 },
      { size: 'XL', stock: 8 },
    ],
    images: {
      main: emptyImage('LAGAMLESS 005 Boxy Tee in Black, front view'),
      front: emptyImage('LAGAMLESS 005 tee, full front'),
      back: emptyImage('LAGAMLESS 005 tee, full back'),
      model: emptyImage('Model wearing LAGAMLESS 005 tee'),
      detail: emptyImage('LAGAMLESS 005 hem and seam detail'),
      fabric: emptyImage('LAGAMLESS 005 fabric close-up'),
    },
    category: 'Tees',
    tags: ['tee', 'boxy', 'cotton', 'essentials'],
    isFeatured: false,
    isNewArrival: true,
    status: 'published',
    createdAt: '2026-08-30',
  },
  {
    id: '6',
    productNumber: 'LAGAMLESS 006',
    sku: 'LGML-006-OLV',
    name: 'Coach Jacket — Olive',
    slug: 'lagamless-006',
    price: 3999,
    compareAtPrice: 4599,
    description: 'A lightweight coach jacket with a snap placket and drawcord hem.',
    story:
      'Shell-weight nylon over a mesh lining, cut a size roomier through the body so it layers over a hoodie without fighting for space through the shoulder.',
    fabric: 'Nylon shell, mesh lining',
    gsm: 0,
    fit: 'Relaxed',
    construction: 'Bonded-seam shell over mesh lining, snap placket, drawcord hem with cord locks.',
    design: 'Cut a size roomier through the body so it layers cleanly over a hoodie.',
    care: 'Machine wash cold on a gentle cycle. Do not bleach. Hang dry. Do not iron.',
    stylingNote: 'Snap it up over a boxy hoodie and leave the drawcord loose.',
    measurements: {
      M: { chest: 50, length: 28, shoulder: 24 },
      L: { chest: 52, length: 29, shoulder: 25 },
      XL: { chest: 54, length: 30, shoulder: 26 },
    },
    sizes: ['M', 'L', 'XL'],
    variants: [
      { size: 'M', stock: 0 },
      { size: 'L', stock: 0 },
      { size: 'XL', stock: 0 },
    ],
    images: {
      main: emptyImage('LAGAMLESS 006 Coach Jacket in Olive, front view'),
      front: emptyImage('LAGAMLESS 006 jacket, full front'),
      back: emptyImage('LAGAMLESS 006 jacket, full back'),
      model: emptyImage('Model wearing LAGAMLESS 006 jacket'),
      detail: emptyImage('LAGAMLESS 006 snap placket detail'),
      fabric: emptyImage('LAGAMLESS 006 shell fabric close-up'),
    },
    category: 'Outerwear',
    tags: ['jacket', 'outerwear', 'nylon'],
    isFeatured: false,
    isNewArrival: false,
    status: 'published',
    createdAt: '2026-03-15',
  },
]

/** Products visible to the storefront (drafts excluded). */
export function getPublishedProducts() {
  return PRODUCTS.filter((p) => p.status === 'published')
}

/* ------------------------------------------------------------------------
 * Admin data access
 * ------------------------------------------------------------------------
 * Everything below this line is used by the admin panel (src/admin) via
 * src/services/adminProducts.js. Unlike the customer-facing helpers above,
 * these read AND write directly to the in-memory `PRODUCTS` array — there
 * is still exactly one array of products, so the storefront and the admin
 * panel can never drift into two incompatible copies of "the catalog"
 * (see Part 07 brief §12/§21). Nothing here is persisted anywhere: a page
 * reload resets the catalog back to the seed data above. Part 08B replaces
 * every function in this section with real Supabase queries without the
 * admin UI needing to change, the same seam `services/products.js` already
 * uses for the storefront.
 * ------------------------------------------------------------------------ */

/**
 * All products, including drafts — the admin panel is the one place
 * allowed to see unpublished products.
 * @returns {Product[]}
 */
export function getAllProductsRaw() {
  return PRODUCTS
}

/**
 * Look up any product by id, published or draft — used by the admin edit
 * form, which must be able to load a draft product too.
 * @param {string} id
 * @returns {Product | undefined}
 */
export function getProductByIdRaw(id) {
  return PRODUCTS.find((p) => p.id === id)
}

/** @param {string} sku, @param {string} [excludeId] */
export function skuExistsRaw(sku, excludeId) {
  const normalized = sku.trim().toLowerCase()
  return PRODUCTS.some(
    (p) => p.id !== excludeId && p.sku.trim().toLowerCase() === normalized,
  )
}

/** @param {string} slug, @param {string} [excludeId] */
export function slugExistsRaw(slug, excludeId) {
  return PRODUCTS.some((p) => p.id !== excludeId && p.slug === slug)
}

/** Generates a new, currently-unused product id. */
export function generateProductId() {
  const existingIds = PRODUCTS.map((p) => Number(p.id)).filter((n) => !Number.isNaN(n))
  const next = (existingIds.length ? Math.max(...existingIds) : 0) + 1
  return String(next)
}

/**
 * Appends a new product to the catalog.
 * @param {Product} product
 * @returns {Product}
 */
export function addProductRecord(product) {
  PRODUCTS.push(product)
  return product
}

/**
 * Merges `updates` onto the product with the given id, in place.
 * @param {string} id
 * @param {Partial<Product>} updates
 * @returns {Product | null}
 */
export function updateProductRecord(id, updates) {
  const product = PRODUCTS.find((p) => p.id === id)
  if (!product) return null
  Object.assign(product, updates)
  return product
}

/**
 * Removes a product from the catalog.
 * @param {string} id
 * @returns {boolean} whether a product was actually removed
 */
export function deleteProductRecord(id) {
  const index = PRODUCTS.findIndex((p) => p.id === id)
  if (index === -1) return false
  PRODUCTS.splice(index, 1)
  return true
}

/**
 * Updates the stock for one size variant of one product, in place. Uses
 * the exact same `variants[]` shape the customer-facing cart/product pages
 * already read from, so admin stock edits are immediately visible to the
 * storefront without a second inventory system (Part 07 brief §12).
 * @param {string} id
 * @param {string} size
 * @param {number} stock
 * @returns {Product | null}
 */
export function updateVariantStockRecord(id, size, stock) {
  const product = PRODUCTS.find((p) => p.id === id)
  if (!product) return null
  const variant = product.variants.find((v) => v.size === size)
  if (!variant) return null
  variant.stock = Math.max(0, Math.round(stock))
  return product
}

/**
 * Look up a published product by id — used by the cart layer to re-check a
 * persisted line against the current catalog (stock, price, existence)
 * without needing an async round-trip through services/products.js.
 * @param {string} id
 * @returns {Product | undefined}
 */
export function getProductById(id) {
  return getPublishedProducts().find((p) => p.id === id)
}

/**
 * Remaining stock for one product + size, or 0 if the size doesn't exist
 * on the product. Used by the cart to cap add/quantity actions.
 * @param {Product} product
 * @param {string} size
 * @returns {number}
 */
export function getVariantStock(product, size) {
  const variant = product.variants.find((v) => v.size === size)
  return variant ? variant.stock : 0
}

/**
 * Total remaining stock across all size variants.
 * @param {Product} product
 * @returns {number}
 */
export function getTotalStock(product) {
  return product.variants.reduce((sum, v) => sum + v.stock, 0)
}

/**
 * Coarse availability bucket, used for badges/filtering.
 * @param {Product} product
 * @returns {'in-stock'|'low-stock'|'sold-out'}
 */
export function getAvailability(product) {
  const total = getTotalStock(product)
  if (total === 0) return 'sold-out'
  if (total <= 6) return 'low-stock'
  return 'in-stock'
}

/**
 * Per-size availability bucket — same idea as getAvailability() but scoped
 * to a single variant, so the size selector can show "Low stock" on one
 * size without implying anything about the others. Raw stock counts are
 * intentionally never returned from here.
 * @param {Product} product
 * @param {string} size
 * @returns {'in-stock'|'low-stock'|'sold-out'|'unavailable'}
 */
export function getSizeAvailability(product, size) {
  const variant = product.variants.find((v) => v.size === size)
  if (!variant) return 'unavailable'
  if (variant.stock === 0) return 'sold-out'
  if (variant.stock <= 3) return 'low-stock'
  return 'in-stock'
}

/**
 * Returns the products to feature on the homepage — currently the products
 * flagged `isFeatured`, kept as its own function so a future Supabase query
 * can replace the filter logic without touching the homepage component.
 *
 * @param {number} count
 * @returns {Product[]}
 */
export function getFeaturedProducts(count = 4) {
  const featured = getPublishedProducts().filter((p) => p.isFeatured)
  const rest = getPublishedProducts().filter((p) => !p.isFeatured)
  return [...featured, ...rest].slice(0, count)
}

/** Distinct categories present in the catalog, in first-seen order. */
export function getCategories() {
  const seen = new Set()
  const categories = []
  for (const product of getPublishedProducts()) {
    if (!seen.has(product.category)) {
      seen.add(product.category)
      categories.push(product.category)
    }
  }
  return categories
}

/** Distinct sizes present across the catalog, in a sensible fixed order. */
export function getAllSizes() {
  const order = ['S', 'M', 'L', 'XL']
  const present = new Set(getPublishedProducts().flatMap((p) => p.sizes))
  return order.filter((size) => present.has(size))
}
