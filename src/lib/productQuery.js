import { getAvailability } from '../data/products.js'

/**
 * @typedef {Object} ProductFilters
 * @property {string} category   - category name, or 'all'
 * @property {string} size       - size, or 'all'
 * @property {string} priceRange - one of PRICE_RANGES keys, or 'all'
 * @property {boolean} inStockOnly
 * @property {boolean} newArrivalsOnly
 * @property {boolean} onSaleOnly
 */

export const SORT_OPTIONS = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
]

// Budget steps for a ₹499–₹999 catalogue. Every option is phrased as "Under ₹X" on purpose: shoppers think about
// what they can spend, never about the top of the range. Bands are cumulative (max only), so each one is a
// simple promise — "nothing here costs more than ₹X". The panel hides steps that add nothing.
export const PRICE_RANGES = {
  all: { label: 'Any budget', min: 0, max: Infinity },
  under599: { label: 'Under ₹599', min: 0, max: 599 },
  under799: { label: 'Under ₹799', min: 0, max: 799 },
  under999: { label: 'Under ₹999', min: 0, max: 999 },
}

/** @returns {ProductFilters} */
export function getDefaultFilters() {
  return {
    category: 'all',
    size: 'all',
    priceRange: 'all',
    inStockOnly: false,
    newArrivalsOnly: false,
    onSaleOnly: false,
  }
}

/**
 * @param {ProductFilters} filters
 * @returns {boolean} whether any filter differs from the default
 */
export function hasActiveFilters(filters) {
  const defaults = getDefaultFilters()
  return Object.keys(defaults).some((key) => filters[key] !== defaults[key])
}

/** How many filters are switched on (drives the badge on the Filters button). */
export function countActiveFilters(filters) {
  const defaults = getDefaultFilters()
  return Object.keys(defaults).filter((key) => filters[key] !== defaults[key]).length
}

/**
 * "How many pieces would I get?" for every option in the filter panel, with all OTHER filters applied.
 * This is what lets the panel show a count next to each option and grey out the ones that lead nowhere.
 */
export function getFacetCounts(products, filters, { sizes = [], categories = [] } = {}) {
  const n = (override) => filterProducts(products, { ...filters, ...override }).length
  const size = {}
  for (const s of sizes) size[s] = n({ size: s })
  const category = {}
  for (const c of categories) category[c] = n({ category: c })
  const price = {}
  for (const key of Object.keys(PRICE_RANGES)) price[key] = n({ priceRange: key })
  return {
    size,
    category,
    price,
    inStock: n({ inStockOnly: true }),
    newArrivals: n({ newArrivalsOnly: true }),
    onSale: n({ onSaleOnly: true }),
  }
}

/**
 * @param {import('../data/products.js').Product[]} products
 * @param {string} query
 */
export function searchProducts(products, query) {
  const q = query.trim().toLowerCase()
  if (!q) return products

  return products.filter((product) => {
    const haystack = [product.name, product.productNumber, product.sku, ...product.tags]
      .join(' ')
      .toLowerCase()
    return haystack.includes(q)
  })
}

/**
 * @param {import('../data/products.js').Product[]} products
 * @param {ProductFilters} filters
 */
export function filterProducts(products, filters) {
  const range = PRICE_RANGES[filters.priceRange] ?? PRICE_RANGES.all

  return products.filter((product) => {
    if (filters.category !== 'all' && product.category !== filters.category) return false
    if (filters.size !== 'all' && !product.sizes.includes(filters.size)) return false
    if (product.price < range.min || product.price > range.max) return false
    if (filters.inStockOnly && getAvailability(product) === 'sold-out') return false
    if (filters.newArrivalsOnly && !product.isNewArrival) return false
    if (filters.onSaleOnly && !(product.compareAtPrice && product.compareAtPrice > product.price)) return false
    return true
  })
}

/**
 * @param {import('../data/products.js').Product[]} products
 * @param {string} sortKey
 */
export function sortProducts(products, sortKey) {
  const sorted = [...products]

  switch (sortKey) {
    case 'newest':
      return sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    case 'price-asc':
      return sorted.sort((a, b) => a.price - b.price)
    case 'price-desc':
      return sorted.sort((a, b) => b.price - a.price)
    case 'featured':
    default:
      return sorted.sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured))
  }
}
