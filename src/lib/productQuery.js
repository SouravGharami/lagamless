import { getAvailability } from '../data/products.js'

/**
 * @typedef {Object} ProductFilters
 * @property {string} category   - category name, or 'all'
 * @property {string} size       - size, or 'all'
 * @property {string} priceRange - one of PRICE_RANGES keys, or 'all'
 * @property {boolean} inStockOnly
 * @property {boolean} newArrivalsOnly
 */

export const SORT_OPTIONS = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
]

export const PRICE_RANGES = {
  all: { label: 'Any price', min: 0, max: Infinity },
  under2000: { label: 'Under ₹2,000', min: 0, max: 2000 },
  '2000to3000': { label: '₹2,000 – ₹3,000', min: 2000, max: 3000 },
  over3000: { label: 'Over ₹3,000', min: 3000, max: Infinity },
}

/** @returns {ProductFilters} */
export function getDefaultFilters() {
  return {
    category: 'all',
    size: 'all',
    priceRange: 'all',
    inStockOnly: false,
    newArrivalsOnly: false,
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
