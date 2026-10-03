import { PRICE_RANGES } from '../../lib/productQuery.js'
import './ActiveFilterChips.css'

/**
 * Renders one removable chip per non-default filter currently applied,
 * plus the free-text search term if present. Replaces the old single
 * "Clear filters" link, which told you *that* filters were active but not
 * *which* ones without opening the panel — this makes the current state of
 * the grid legible at a glance and lets you drop one filter at a time.
 *
 * @param {{
 *   search: string,
 *   onSearchChange: (value: string) => void,
 *   filters: import('../../lib/productQuery.js').ProductFilters,
 *   onFilterChange: (key: string, value: string|boolean) => void,
 *   onClearAll: () => void,
 *   collectionLabel?: string,
 *   onClearCollection?: () => void,
 * }} props
 */
function ActiveFilterChips({
  search,
  onSearchChange,
  filters,
  onFilterChange,
  onClearAll,
  collectionLabel,
  onClearCollection,
}) {
  const chips = []

  if (collectionLabel) {
    chips.push({ key: 'collection', label: collectionLabel, onRemove: onClearCollection })
  }

  if (search.trim()) {
    chips.push({ key: 'search', label: `"${search.trim()}"`, onRemove: () => onSearchChange('') })
  }
  if (filters.category !== 'all') {
    chips.push({ key: 'category', label: filters.category, onRemove: () => onFilterChange('category', 'all') })
  }
  if (filters.size !== 'all') {
    chips.push({ key: 'size', label: `Size ${filters.size}`, onRemove: () => onFilterChange('size', 'all') })
  }
  if (filters.priceRange !== 'all') {
    chips.push({
      key: 'price',
      label: PRICE_RANGES[filters.priceRange]?.label ?? filters.priceRange,
      onRemove: () => onFilterChange('priceRange', 'all'),
    })
  }
  if (filters.inStockOnly) {
    chips.push({ key: 'stock', label: 'In stock only', onRemove: () => onFilterChange('inStockOnly', false) })
  }
  if (filters.newArrivalsOnly) {
    chips.push({ key: 'new', label: 'New arrivals', onRemove: () => onFilterChange('newArrivalsOnly', false) })
  }

  if (chips.length === 0) return null

  return (
    <ul className="active-chips">
      {chips.map((chip) => (
        <li key={chip.key} className="active-chips__chip">
          <span>{chip.label}</span>
          <button type="button" onClick={chip.onRemove} aria-label={`Remove ${chip.label} filter`}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </li>
      ))}
      {chips.length > 1 && (
        <li>
          <button type="button" className="active-chips__clear-all" onClick={onClearAll}>
            Clear all
          </button>
        </li>
      )}
    </ul>
  )
}

export default ActiveFilterChips
