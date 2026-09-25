import { Link } from 'react-router-dom'
import './Breadcrumbs.css'

/**
 * Small but real: the old Shop page had no wayfinding above the H1 at all.
 * Cheap to add, meaningfully helps orientation on a catalog with real
 * category depth, and gives Google a breadcrumb trail to key off in
 * search results.
 *
 * @param {{ items: { label: string, to?: string }[] }} props
 */
function Breadcrumbs({ items }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <li key={item.label}>
              {item.to && !isLast ? (
                <Link to={item.to} className="breadcrumbs__link">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={isLast ? 'page' : undefined}>{item.label}</span>
              )}
              {!isLast && (
                <span className="breadcrumbs__sep" aria-hidden="true">
                  /
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export default Breadcrumbs
