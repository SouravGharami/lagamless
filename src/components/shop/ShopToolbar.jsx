import { hasActiveFilters, SORT_OPTIONS } from '../../lib/productQuery.js'
import './ShopToolbar.css'

/**
 * Grid header row — "<Title> (<count>)" on the left, sort + grid/list view
 * toggle + the mobile-only "Filters" trigger on the right. Matches the
 * reference design's toolbar; search now lives in the top utility bar
 * instead of duplicating it here.
 *
 * @param {{
 *   title: string,
 *   sort: string,
 *   onSortChange: (value: string) => void,
 *   resultCount: number,
 *   onOpenFilters: () => void,
 *   filters: import('../../lib/productQuery.js').ProductFilters,
 *   density: 'comfort' | 'compact',
 *   onDensityChange: (value: 'comfort' | 'compact') => void,
 * }} props
 */
function ShopToolbar({
  title,
  sort,
  onSortChange,
  resultCount,
  onOpenFilters,
  filters,
  density,
  onDensityChange,
}) {
  const activeFilters = hasActiveFilters(filters)

  return (
    <div className="shop-toolbar">
      <h2 className="shop-toolbar__title">
        {title} <span className="shop-toolbar__count">({resultCount})</span>
      </h2>

      <div className="shop-toolbar__row-actions">
        <label className="shop-toolbar__sort">
          <span className="visually-hidden">Sort by</span>
          <select value={sort} onChange={(e) => onSortChange(e.target.value)} className="shop-toolbar__select">
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                Sort by: {opt.label}
              </option>
            ))}
          </select>
          <ChevronIcon />
        </label>

        <div className="shop-toolbar__density" role="group" aria-label="Grid view">
          <button
            type="button"
            className={`shop-toolbar__density-btn${density === 'comfort' ? ' is-active' : ''}`}
            onClick={() => onDensityChange('comfort')}
            aria-pressed={density === 'comfort'}
            aria-label="Grid view"
          >
            <GridIcon />
          </button>
          <button
            type="button"
            className={`shop-toolbar__density-btn${density === 'compact' ? ' is-active' : ''}`}
            onClick={() => onDensityChange('compact')}
            aria-pressed={density === 'compact'}
            aria-label="List view"
          >
            <ListIcon />
          </button>
        </div>

        <button type="button" className="shop-toolbar__filter-toggle" onClick={onOpenFilters}>
          Filters{activeFilters ? ' •' : ''}
        </button>
      </div>
    </div>
  )
}

function ChevronIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {[0, 1].map((i) => (
        <rect key={i} x={i * 8 + 0.5} y="1" width="6.5" height="14" stroke="currentColor" strokeWidth="1.2" />
      ))}
    </svg>
  )
}

function ListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1" y="1.5" width="14" height="4" stroke="currentColor" strokeWidth="1.2" />
      <rect x="1" y="10.5" width="14" height="4" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

export default ShopToolbar
