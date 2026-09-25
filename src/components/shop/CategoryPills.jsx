import './CategoryPills.css'

/**
 * Horizontal, always-visible category shortcut — the fastest path to a
 * narrower grid for the ~80% of visitors who arrive already knowing "I
 * want a hoodie", without opening the filter drawer at all. Sits directly
 * above the toolbar; scrolls horizontally on small screens instead of
 * wrapping, so it never pushes the grid down on mobile.
 *
 * @param {{ categories: string[], active: string, onSelect: (value: string) => void }} props
 */
function CategoryPills({ categories, active, onSelect }) {
  return (
    <div className="category-pills" role="tablist" aria-label="Shop by category">
      <button
        type="button"
        role="tab"
        aria-selected={active === 'all'}
        className={`category-pills__item${active === 'all' ? ' is-active' : ''}`}
        onClick={() => onSelect('all')}
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat}
          type="button"
          role="tab"
          aria-selected={active === cat}
          className={`category-pills__item${active === cat ? ' is-active' : ''}`}
          onClick={() => onSelect(cat)}
        >
          {cat}
        </button>
      ))}
    </div>
  )
}

export default CategoryPills
