import { PRICE_RANGES } from '../../lib/productQuery.js'
import './FilterPanel.css'

const TOGGLES = [
  { key: 'inStockOnly', countKey: 'inStock', label: 'Ready to ship', hint: 'In stock right now' },
  { key: 'newArrivalsOnly', countKey: 'newArrivals', label: 'New arrivals', hint: 'The latest drop' },
  { key: 'onSaleOnly', countKey: 'onSale', label: 'On sale', hint: 'Reduced prices' },
]

function Group({ index, title, summary, children, defaultOpen = true }) {
  return (
    <details className="fp-group" open={defaultOpen}>
      <summary className="fp-group__summary">
        <span className="fp-group__num">{index}</span>
        <span className="fp-group__title">{title}</span>
        {summary && <span className="fp-group__value">{summary}</span>}
        <span className="fp-group__chev" aria-hidden="true" />
      </summary>
      <div className="fp-group__body">{children}</div>
    </details>
  )
}

/**
 * The one filter UI used everywhere: the desktop sidebar AND the mobile bottom sheet render this same panel,
 * so both always offer the same options. Every option shows how many pieces it would give (counts already
 * respect the other filters), and options that lead to nothing are dimmed instead of being a dead end.
 *
 * @param {{
 *   filters: import('../../lib/productQuery.js').ProductFilters,
 *   onFilterChange: (key: string, value: string|boolean) => void,
 *   sizes: string[],
 *   counts: ReturnType<typeof import('../../lib/productQuery.js').getFacetCounts>,
 * }} props
 */
function FilterPanel({ filters, onFilterChange, sizes, counts }) {
  // Range steps worth showing: not empty, and not a copy of the step below it (e.g. "Under ₹799" and "Under ₹999"
  // both giving everything would just be noise). The step the shopper already picked always stays.
  const rangeKeys = []
  let lastCount = -1
  for (const key of Object.keys(PRICE_RANGES).filter((k) => k !== 'all')) {
    const c = counts.price[key] ?? 0
    const keep = filters.priceRange === key || (c > 0 && c !== lastCount)
    if (keep) rangeKeys.push(key)
    if (c > 0) lastCount = c
  }
  const showRange = rangeKeys.length > 0
  let n = 0
  const next = () => String(++n).padStart(2, '0')

  return (
    <div className="fp">
      {sizes.length > 0 && (
        <Group index={next()} title="Size" summary={filters.size !== 'all' ? filters.size : null}>
          <div className="fp-sizes" role="group" aria-label="Size">
            {sizes.map((size) => {
              const active = filters.size === size
              const count = counts.size[size] ?? 0
              const dim = count === 0 && !active
              return (
                <button
                  key={size}
                  type="button"
                  className={`fp-size${active ? ' is-active' : ''}${dim ? ' is-dim' : ''}`}
                  aria-pressed={active}
                  disabled={dim}
                  onClick={() => onFilterChange('size', active ? 'all' : size)}
                >
                  <span className="fp-size__label">{size}</span>
                  <span className="fp-size__count">{count}</span>
                </button>
              )
            })}
          </div>
        </Group>
      )}

      {showRange && (
        <Group index={next()} title="Range" summary={filters.priceRange !== 'all' ? PRICE_RANGES[filters.priceRange]?.label : null}>
          <div className="fp-budget" role="radiogroup" aria-label="Price range">
            <button
              type="button"
              role="radio"
              aria-checked={filters.priceRange === 'all'}
              className={`fp-budget__card${filters.priceRange === 'all' ? ' is-active' : ''}`}
              onClick={() => onFilterChange('priceRange', 'all')}
            >
              <span className="fp-budget__under">Browse</span>
              <span className="fp-budget__amount">All</span>
            </button>
            {rangeKeys.map((key) => {
              const active = filters.priceRange === key
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`fp-budget__card${active ? ' is-active' : ''}`}
                  onClick={() => onFilterChange('priceRange', key)}
                >
                  <span className="fp-budget__under">Under</span>
                  <span className="fp-budget__amount">₹{PRICE_RANGES[key].max.toLocaleString('en-IN')}</span>
                </button>
              )
            })}
          </div>
        </Group>
      )}

      <Group index={next()} title="Quick picks">
        <div className="fp-rows">
          {TOGGLES.map((t) => {
            const on = filters[t.key]
            const count = counts[t.countKey] ?? 0
            const dim = count === 0 && !on
            return (
              <label key={t.key} className={`fp-toggle${on ? ' is-on' : ''}${dim ? ' is-dim' : ''}`}>
                <input
                  type="checkbox"
                  role="switch"
                  className="visually-hidden"
                  checked={on}
                  disabled={dim}
                  onChange={(e) => onFilterChange(t.key, e.target.checked)}
                />
                <span className="fp-toggle__copy">
                  <span className="fp-toggle__label">{t.label}</span>
                  <span className="fp-toggle__hint">{t.hint}</span>
                </span>
                <span className="fp-toggle__count">{count}</span>
                <span className="fp-toggle__track" aria-hidden="true" />
              </label>
            )
          })}
        </div>
      </Group>

    </div>
  )
}

export default FilterPanel
