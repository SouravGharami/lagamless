import EditorialImage from '../EditorialImage.jsx'
import { HOME_IMAGES } from '../../data/homeImages.js'
import { hasActiveFilters } from '../../lib/productQuery.js'
import './ShopSidebar.css'

const DESIGN_TYPES = ['Graphic', 'Minimal', 'Cultural', 'Typography', 'Acid Wash']

/**
 * Persistent desktop filter rail — Size / Colour / Design type — plus the
 * "Wear bigger. Think different." promo card underneath it, matching the
 * reference sidebar. Colour and design-type are page-local refinements on
 * top of the shared category/size/price filters (the catalog doesn't model
 * colour or design tags as first-class fields), so they're passed in and
 * handled by the Shop page directly rather than living in productQuery.js.
 *
 * @param {{
 *   filters: import('../../lib/productQuery.js').ProductFilters,
 *   onFilterChange: (key: string, value: string|boolean) => void,
 *   onClearFilters: () => void,
 *   sizes: string[],
 *   colors: { name: string, hex: string }[],
 *   selectedColor: string|null,
 *   onColorChange: (name: string|null) => void,
 *   selectedDesigns: Set<string>,
 *   onDesignToggle: (label: string) => void,
 * }} props
 */
function ShopSidebar({
  filters,
  onFilterChange,
  onClearFilters,
  sizes,
  colors,
  selectedColor,
  onColorChange,
  selectedDesigns,
  onDesignToggle,
}) {
  const anyActive =
    hasActiveFilters(filters) || Boolean(selectedColor) || selectedDesigns.size > 0

  return (
    <aside className="shop-sidebar">
      <div className="shop-sidebar__header">
        <span className="text-h3 shop-sidebar__title">Filters</span>
        {anyActive && (
          <button type="button" className="shop-sidebar__reset" onClick={onClearFilters}>
            Reset all
          </button>
        )}
      </div>

      <div className="shop-sidebar__group">
        <span className="text-label shop-sidebar__label">Size</span>
        <div className="shop-sidebar__sizes">
          {sizes.map((size) => (
            <button
              key={size}
              type="button"
              className={`shop-sidebar__size${filters.size === size ? ' is-active' : ''}`}
              aria-pressed={filters.size === size}
              onClick={() => onFilterChange('size', filters.size === size ? 'all' : size)}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      <div className="shop-sidebar__group">
        <span className="text-label shop-sidebar__label">Color</span>
        <div className="shop-sidebar__colors">
          {colors.map((color) => (
            <button
              key={color.name}
              type="button"
              className={`shop-sidebar__color${selectedColor === color.name ? ' is-active' : ''}`}
              style={{ '--swatch': color.hex }}
              aria-pressed={selectedColor === color.name}
              aria-label={color.name}
              title={color.name}
              onClick={() => onColorChange(selectedColor === color.name ? null : color.name)}
            />
          ))}
        </div>
      </div>

      <div className="shop-sidebar__group">
        <span className="text-label shop-sidebar__label">Design Type</span>
        <div className="shop-sidebar__checks">
          {DESIGN_TYPES.map((label) => (
            <label key={label} className="shop-sidebar__check">
              <input
                type="checkbox"
                checked={selectedDesigns.has(label)}
                onChange={() => onDesignToggle(label)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>

      <a href="/shop" className="shop-sidebar__promo">
        <EditorialImage image={HOME_IMAGES.shopSidebarPromo} className="shop-sidebar__promo-image" />
        <span className="sr-only">Wear bigger. Think different. — LAGAMLESS</span>
      </a>
    </aside>
  )
}

export default ShopSidebar
