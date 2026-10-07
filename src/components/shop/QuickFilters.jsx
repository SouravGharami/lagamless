import './QuickFilters.css'

/**
 * Phone/tablet shortcut strip under the toolbar: one tap on the filters people reach for most, without opening
 * the sheet. Chips that would give nothing are hidden; price chips never show a count.
 */
function QuickFilters({ filters, onFilterChange, counts }) {
  const items = [
    { key: 'inStockOnly', label: 'Ready to ship', count: counts.inStock, on: filters.inStockOnly, set: (v) => onFilterChange('inStockOnly', v) },
    { key: 'newArrivalsOnly', label: 'New', count: counts.newArrivals, on: filters.newArrivalsOnly, set: (v) => onFilterChange('newArrivalsOnly', v) },
    { key: 'onSaleOnly', label: 'On sale', count: counts.onSale, on: filters.onSaleOnly, set: (v) => onFilterChange('onSaleOnly', v) },
    { key: 'under599', label: 'Under ₹599', hideCount: true, count: counts.price.under599, on: filters.priceRange === 'under599', set: (v) => onFilterChange('priceRange', v ? 'under599' : 'all') },
    { key: 'under799', label: 'Under ₹799', hideCount: true, count: counts.price.under799, on: filters.priceRange === 'under799', set: (v) => onFilterChange('priceRange', v ? 'under799' : 'all') },
  ].filter((i) => i.on || (i.count ?? 0) > 0)

  if (items.length === 0) return null

  return (
    <div className="quick-filters" role="group" aria-label="Quick filters">
      {items.map((i) => (
        <button
          key={i.key}
          type="button"
          className={`quick-filters__chip${i.on ? ' is-on' : ''}`}
          aria-pressed={i.on}
          onClick={() => i.set(!i.on)}
        >
          {i.label}
          {!i.hideCount && <span>{i.count}</span>}
        </button>
      ))}
    </div>
  )
}

export default QuickFilters
