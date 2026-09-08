import { useState } from 'react'
import { PRICE_RANGES, SORT_OPTIONS, hasActiveFilters } from '../../lib/productQuery.js'
import './ShopToolbar.css'

/**
 * @param {{
 *   search: string,
 *   onSearchChange: (value: string) => void,
 *   sort: string,
 *   onSortChange: (value: string) => void,
 *   filters: import('../../lib/productQuery.js').ProductFilters,
 *   onFilterChange: (key: string, value: string|boolean) => void,
 *   onClearFilters: () => void,
 *   categories: string[],
 *   sizes: string[],
 *   resultCount: number,
 * }} props
 */
function ShopToolbar({
  search,
  onSearchChange,
  sort,
  onSortChange,
  filters,
  onFilterChange,
  onClearFilters,
  categories,
  sizes,
  resultCount,
}) {
  const [filtersOpen, setFiltersOpen] = useState(false)
  const activeFilters = hasActiveFilters(filters)

  return (
    <div className="shop-toolbar">
      <div className="shop-toolbar__row">
        <div className="shop-toolbar__search">
          <SearchGlyph />
          <input
            type="search"
            className="shop-toolbar__search-input"
            placeholder="Search products, SKU, style..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search products"
          />
        </div>

        <div className="shop-toolbar__row-actions">
          <label className="shop-toolbar__sort">
            <span className="visually-hidden">Sort by</span>
            <select value={sort} onChange={(e) => onSortChange(e.target.value)} className="shop-toolbar__select">
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  Sort: {opt.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="shop-toolbar__filter-toggle"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            Filters{activeFilters ? ' •' : ''}
          </button>
        </div>
      </div>

      <div className={`shop-toolbar__filters${filtersOpen ? ' shop-toolbar__filters--open' : ''}`}>
        <label className="shop-toolbar__field">
          <span className="text-label">Category</span>
          <select
            className="shop-toolbar__select"
            value={filters.category}
            onChange={(e) => onFilterChange('category', e.target.value)}
          >
            <option value="all">All categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </label>

        <label className="shop-toolbar__field">
          <span className="text-label">Size</span>
          <select
            className="shop-toolbar__select"
            value={filters.size}
            onChange={(e) => onFilterChange('size', e.target.value)}
          >
            <option value="all">All sizes</option>
            {sizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        <label className="shop-toolbar__field">
          <span className="text-label">Price</span>
          <select
            className="shop-toolbar__select"
            value={filters.priceRange}
            onChange={(e) => onFilterChange('priceRange', e.target.value)}
          >
            {Object.entries(PRICE_RANGES).map(([key, range]) => (
              <option key={key} value={key}>
                {range.label}
              </option>
            ))}
          </select>
        </label>

        <label className="shop-toolbar__checkbox">
          <input
            type="checkbox"
            checked={filters.inStockOnly}
            onChange={(e) => onFilterChange('inStockOnly', e.target.checked)}
          />
          <span className="text-small">In stock only</span>
        </label>

        <label className="shop-toolbar__checkbox">
          <input
            type="checkbox"
            checked={filters.newArrivalsOnly}
            onChange={(e) => onFilterChange('newArrivalsOnly', e.target.checked)}
          />
          <span className="text-small">New arrivals</span>
        </label>

        {activeFilters && (
          <button type="button" className="shop-toolbar__clear" onClick={onClearFilters}>
            Clear filters
          </button>
        )}
      </div>

      <p className="text-small shop-toolbar__count">
        {resultCount} {resultCount === 1 ? 'product' : 'products'}
      </p>
    </div>
  )
}

function SearchGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <line x1="12.5" y1="12.5" x2="17" y2="17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export default ShopToolbar
