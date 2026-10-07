import EditorialImage from '../EditorialImage.jsx'
import { HOME_IMAGES } from '../../data/homeImages.js'
import { countActiveFilters } from '../../lib/productQuery.js'
import FilterPanel from './FilterPanel.jsx'
import './ShopSidebar.css'

const PROMISES = [
  { icon: 'fabric', title: '240 GSM heavyweight', text: 'Combed cotton that holds its shape, wash after wash.' },
  { icon: 'fit', title: 'One oversized fit', text: 'Drop shoulder, relaxed drape. Cut to be worn big.' },
  { icon: 'ship', title: 'Free shipping ₹999+', text: 'Cash on delivery available across India.' },
  { icon: 'swap', title: '7-day easy exchange', text: "Wrong size? We'll swap it, no drama." },
]

function PromiseIcon({ name }) {
  const p = { viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
  switch (name) {
    case 'fabric':
      return (<svg {...p}><path d="M4 8c3-2 5 2 8 0s5-2 8 0M4 13c3-2 5 2 8 0s5-2 8 0M4 18c3-2 5 2 8 0s5-2 8 0" /></svg>)
    case 'fit':
      return (<svg {...p}><path d="M8 4l-5 3 2 4 3-1v10h8V10l3 1 2-4-5-3c-.6 1.4-1.8 2-4 2S8.600 5.400 8 4z" /></svg>)
    case 'ship':
      return (<svg {...p}><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="17.500" r="1.600" /><circle cx="17" cy="17.500" r="1.600" /></svg>)
    default:
      return (<svg {...p}><path d="M4 10a8 8 0 0 1 14-3.500L20 9M20 14a8 8 0 0 1-14 3.500L4 15M20 4v5h-5M4 20v-5h5" /></svg>)
  }
}

/**
 * Persistent desktop filter rail (sticky while the grid scrolls): the shared FilterPanel, then the
 * "LAGAMLESS promise" card and the "Wear bigger. Think different." promo.
 */
function ShopSidebar({ filters, onFilterChange, onClearFilters, sizes, categories, counts }) {
  const activeCount = countActiveFilters(filters)

  return (
    <aside className="shop-sidebar" aria-label="Filters">
      <div className="shop-sidebar__header">
        <span className="shop-sidebar__title">
          Filters
          {activeCount > 0 && <span className="shop-sidebar__badge">{activeCount}</span>}
        </span>
        {activeCount > 0 && (
          <button type="button" className="shop-sidebar__reset" onClick={onClearFilters}>
            Reset all
          </button>
        )}
      </div>

      <FilterPanel filters={filters} onFilterChange={onFilterChange} sizes={sizes} categories={categories} counts={counts} />

      <section className="shop-promise" aria-labelledby="shop-promise-title">
        <p className="shop-promise__kicker">
          <span aria-hidden="true" />
          The LAGAMLESS promise
        </p>
        <h2 id="shop-promise-title" className="shop-promise__title">
          Built to be <em>lived in.</em>
        </h2>
        <ul className="shop-promise__list">
          {PROMISES.map((item) => (
            <li key={item.title} className="shop-promise__item">
              <span className="shop-promise__icon">
                <PromiseIcon name={item.icon} />
              </span>
              <span className="shop-promise__copy">
                <strong>{item.title}</strong>
                <span>{item.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <a href="/shop" className="shop-sidebar__promo">
        <EditorialImage image={HOME_IMAGES.shopSidebarPromo} className="shop-sidebar__promo-image" />
        <span className="sr-only">Wear bigger. Think different. — LAGAMLESS</span>
      </a>
    </aside>
  )
}

export default ShopSidebar
