import { useEffect, useRef } from 'react'
import { TILES } from '../home/CollectionGrid.jsx'
import './CategoryRail.css'

/**
 * Sticky "jump bar" for the Shop page: All T-shirts + the same seven moods as the strip above. It stays pinned under
 * the navbar while the product grid scrolls, so a shopper can change category at any moment without scrolling back
 * to the top. The chosen one is highlighted and kept in view on phones.
 *
 * @param {{ active: string, onSelect: (slug: string) => void }} props
 */
function CategoryRail({ active, onSelect }) {
  const barRef = useRef(null)

  useEffect(() => {
    const bar = barRef.current
    const el = bar?.querySelector('[aria-pressed="true"]')
    if (!bar || !el) return
    bar.scrollTo({ left: el.offsetLeft - (bar.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' })
  }, [active])

  const items = [{ slug: 'all', label: 'All T-shirts' }, ...TILES.map((t) => ({ slug: t.slug, label: t.eyebrow === 'For' ? t.title : t.slug === 'new-arrivals' ? 'New Arrivals' : t.title }))]

  return (
    <nav className="category-rail" aria-label="Browse categories">
      <div className="category-rail__bar" ref={barRef}>
        {items.map((item) => {
          const on = active === item.slug
          return (
            <button
              key={item.slug}
              type="button"
              className={`category-rail__pill${on ? ' is-active' : ''}`}
              aria-pressed={on}
              onClick={() => onSelect(item.slug)}
            >
              {item.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export default CategoryRail
