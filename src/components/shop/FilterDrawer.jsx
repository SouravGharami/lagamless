import { useEffect, useRef } from 'react'
import { countActiveFilters } from '../../lib/productQuery.js'
import FilterPanel from './FilterPanel.jsx'
import './FilterDrawer.css'

/**
 * Mobile / tablet filters: a bottom sheet that rises from the thumb's edge. It renders the SAME FilterPanel as the
 * desktop sidebar, with a sticky footer showing the live result count. Drag the handle down (or tap outside /
 * press Esc) to close.
 */
function FilterDrawer({ open, onClose, filters, onFilterChange, onClearFilters, categories, sizes, counts, resultCount }) {
  const sheetRef = useRef(null)
  const closeBtnRef = useRef(null)
  const drag = useRef({ y: null, dy: 0 })
  const activeCount = countActiveFilters(filters)

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKeyDown)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeBtnRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  const onTouchStart = (e) => {
    drag.current = { y: e.touches[0].clientY, dy: 0 }
    if (sheetRef.current) sheetRef.current.style.transition = 'none'
  }
  const onTouchMove = (e) => {
    if (drag.current.y === null) return
    const dy = Math.max(0, e.touches[0].clientY - drag.current.y)
    drag.current.dy = dy
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${dy}px)`
  }
  const onTouchEnd = () => {
    const { dy } = drag.current
    drag.current = { y: null, dy: 0 }
    if (!sheetRef.current) return
    sheetRef.current.style.transition = ''
    if (dy > 90) onClose()
    else sheetRef.current.style.transform = ''
  }

  return (
    <div className="filter-drawer-root">
      <button type="button" className="filter-drawer__backdrop" aria-label="Close filters" onClick={onClose} />
      <aside className="filter-drawer" role="dialog" aria-modal="true" aria-label="Filter products" ref={sheetRef}>
        <div className="filter-drawer__header" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
          <span className="filter-drawer__grab" aria-hidden="true" />
          <div className="filter-drawer__heading">
            <h2 className="filter-drawer__title">Filters</h2>
            {activeCount > 0 && <span className="filter-drawer__badge">{activeCount} on</span>}
          </div>
          <button type="button" className="filter-drawer__close" onClick={onClose} ref={closeBtnRef} aria-label="Close filters">
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M2 2l14 14M16 2L2 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="filter-drawer__body">
          <FilterPanel filters={filters} onFilterChange={onFilterChange} sizes={sizes} categories={categories} counts={counts} />
        </div>

        <div className="filter-drawer__footer">
          <button type="button" className="filter-drawer__clear" onClick={onClearFilters} disabled={activeCount === 0}>
            Clear all
          </button>
          <button type="button" className="filter-drawer__apply" onClick={onClose}>
            {resultCount === 0 ? 'No pieces match' : `Show ${resultCount} ${resultCount === 1 ? 'piece' : 'pieces'}`}
          </button>
        </div>
      </aside>
    </div>
  )
}

export default FilterDrawer
