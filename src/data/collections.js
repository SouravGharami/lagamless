/**
 * Store placement — the ONE list of things an admin can tick on a product
 * to decide where it shows up on the storefront.
 *
 * Read by:
 *   - the admin product form (renders the tick-boxes from this list)
 *   - the homepage "shop by mood" strip (each tile links to /shop?collection=<slug>)
 *   - the Shop page "shop by edit" tiles and its collection filter
 *   - the admin product list ("On the store" line under each name)
 *
 * To add a new tile later: add one entry to COLLECTIONS below, then add the
 * matching tile (image + copy) in CollectionGrid.jsx or CategoryTiles.jsx.
 * Nothing else needs to change — no database change either, because
 * `products.collections` just stores the slugs.
 *
 * `flag` — a collection that is backed by an existing yes/no column on the
 * product instead of the `collections` array. "New Arrivals" reuses
 * `is_new_arrival`, so there is only ever one place that says a product is
 * new (it also drives the "New" badge on product cards).
 */

/** How many products the homepage "Featured Tees" section shows (newest first). */
export const HOMEPAGE_FEATURED_LIMIT = 8

/**
 * @typedef {Object} Collection
 * @property {string} slug     stable id stored on the product and used in the URL
 * @property {string} label    shown to admins and shoppers
 * @property {'home'|'shop'} group
 * @property {'isNewArrival'} [flag]
 */

/** @type {Collection[]} */
export const COLLECTIONS = [
  // Homepage "shop by mood" strip — same order as the tiles.
  { slug: 'gen-z', label: 'Gen Z', group: 'home' },
  { slug: 'millennials', label: 'Millennials', group: 'home' },
  { slug: 'durga-puja', label: 'Durga Puja Collection', group: 'home' },
  { slug: 'pop-culture', label: 'Pop Culture Fans', group: 'home' },
  { slug: 'minimal-lovers', label: 'Minimal Lovers', group: 'home' },
  { slug: 'streetwear-heads', label: 'Streetwear Heads', group: 'home' },
  { slug: 'new-arrivals', label: 'New Arrivals', group: 'home', flag: 'isNewArrival' },

  // Shop page "shop by edit" tiles. ("All T-Shirts" needs no tag — it shows everything.)
  { slug: 'graphic-tees', label: 'Graphic Tees', group: 'shop' },
  { slug: 'minimal-tees', label: 'Minimal Tees', group: 'shop' },
  { slug: 'cultural-edits', label: 'Cultural Edits', group: 'shop' },
]

/** Group headings + one-line explanations, used by the admin form. */
export const COLLECTION_GROUPS = [
  {
    key: 'home',
    title: 'Homepage categories',
    hint: 'The seven tiles under the hero. A shopper who clicks a tile sees the products ticked here.',
  },
  {
    key: 'shop',
    title: 'Shop page categories',
    hint: 'The tiles at the top of the Shop page. “All T-Shirts” always shows every published product, so it has no tick-box.',
  },
]

export function getCollection(slug) {
  return COLLECTIONS.find((c) => c.slug === slug)
}

/** Returns a known slug, or 'all' for anything missing/unknown (e.g. a typo in the URL). */
export function normalizeCollectionSlug(slug) {
  return slug && getCollection(slug) ? slug : 'all'
}

/**
 * Whether a product belongs to a collection.
 * @param {{ collections?: string[], isNewArrival?: boolean }} product
 * @param {string} slug  a collection slug, or 'all'
 */
export function productInCollection(product, slug) {
  if (!slug || slug === 'all') return true
  const collection = getCollection(slug)
  if (!collection) return false
  if (collection.flag) return !!product[collection.flag]
  return (product.collections || []).includes(slug)
}

/**
 * Human-readable list of every place a product is tagged to appear —
 * used for the admin form summary and the admin product list.
 * @param {{ isFeatured?: boolean, collections?: string[], isNewArrival?: boolean }} product
 * @returns {string[]}
 */
export function getPlacementLabels(product) {
  const labels = []
  if (product.isFeatured) labels.push('Featured Tees')
  for (const collection of COLLECTIONS) {
    if (productInCollection(product, collection.slug)) labels.push(collection.label)
  }
  return labels
}
