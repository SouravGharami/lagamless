import { useEffect, useRef } from 'react'
import { PRICE_RANGES } from '../../lib/productQuery.js'
import './FilterDrawer.css'

/**
 * Filters, moved out of an inline-expanding panel (the old ShopToolbar
 * behaviour) into a proper slide-in drawer — same interaction pattern as
 * CartDrawer, reused deliberately so the site has exactly one "panel that
 * slides in from the right" pattern instead of two competing ones. This
 * scales far better than the old panel once there are more than three
 * filter groups, and gives every filter control room to be a real tap
 * target (pill/swatch buttons) instead of a cramped native <select>.
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   filters: import('../../lib/productQuery.js').ProductFilters,
 *   onFilterChange: (key: string, value: string|boolean) => void,
 *   onClearFilters: () => void,
 *   categories: string[],
 *   sizes: string[],
 *   resultCount: number,
 * }} props
 */
function FilterDrawer({
  open,
  onClose,
  filters,
  onFilterChange,
  onClearFilters,
  categories,
  sizes,
  resultCount,
}) {
  const closeBtnRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    function onKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    closeBtnRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="filter-drawer-root">
      <button
        type="button"
        className="filter-drawer__backdrop"
        aria-label="Close filters"
        onClick={onClose}
      />
      <aside className="filter-drawer" role="dialog" aria-modal="true" aria-label="Filter products">
        <div className="filter-drawer__header">
          <h2 className="text-h3">Filters</h2>
          <button
            type="button"
            className="filter-drawer__close"
            onClick={onClose}
            ref={closeBtnRef}
            aria-label="Close filters"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="filter-drawer__body">
          <fieldset className="filter-drawer__group">
            <legend className="text-label">Category</legend>
            <div className="filter-drawer__pills">
              <button
                type="button"
                className={`filter-drawer__pill${filters.category === 'all' ? ' is-active' : ''}`}
                onClick={() => onFilterChange('category', 'all')}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`filter-drawer__pill${filters.category === cat ? ' is-active' : ''}`}
                  onClick={() => onFilterChange('category', cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="filter-drawer__group">
            <legend className="text-label">Size</legend>
            <div className="filter-drawer__pills">
              <button
                type="button"
                className={`filter-drawer__pill${filters.size === 'all' ? ' is-active' : ''}`}
                onClick={() => onFilterChange('size', 'all')}
              >
                All
              </button>
              {sizes.map((size) => (
                <button
                  key={size}
                  type="button"
                  className={`filter-drawer__pill filter-drawer__pill--swatch${filters.size === size ? ' is-active' : ''}`}
                  onClick={() => onFilterChange('size', size)}
                >
                  {size}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="filter-drawer__group">
            <legend className="text-label">Price</legend>
            <div className="filter-drawer__pills filter-drawer__pills--stack">
              {Object.entries(PRICE_RANGES).map(([key, range]) => (
                <button
                  key={key}
                  type="button"
                  className={`filter-drawer__pill filter-drawer__pill--block${filters.priceRange === key ? ' is-active' : ''}`}
                  onClick={() => onFilterChange('priceRange', key)}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="filter-drawer__group">
            <legend className="text-label">Availability</legend>
            <label className="filter-drawer__checkbox">
              <input
                type="checkbox"
                checked={filters.inStockOnly}
                onChange={(e) => onFilterChange('inStockOnly', e.target.checked)}
              />
              <span>In stock only</span>
            </label>
            <label className="filter-drawer__checkbox">
              <input
                type="checkbox"
                checked={filters.newArrivalsOnly}
                onChange={(e) => onFilterChange('newArrivalsOnly', e.target.checked)}
              />
              <span>New arrivals only</span>
            </label>
          </fieldset>
        </div>

        <div className="filter-drawer__footer">
          <button type="button" className="btn btn-secondary filter-drawer__clear" onClick={onClearFilters}>
            Clear all
          </button>
          <button type="button" className="btn btn-primary filter-drawer__apply" onClick={onClose}>
            Show {resultCount} {resultCount === 1 ? 'result' : 'results'}
          </button>
        </div>
      </aside>
    </div>
  )
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M2 2l14 14M16 2L2 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export default FilterDrawer
