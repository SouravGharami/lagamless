import './Pagination.css'

/**
 * Numbered page control for the product grid — replaces the old
 * "Load more" button to match the reference design's 1 2 3 4 … N strip
 * with prev/next arrows. Collapses the middle of long runs into an
 * ellipsis, always keeping the first, last, current, and its neighbours
 * visible.
 *
 * @param {{ page: number, pageCount: number, onPageChange: (page: number) => void }} props
 */
function Pagination({ page, pageCount, onPageChange }) {
  if (pageCount <= 1) return null

  const pages = getPageList(page, pageCount)

  return (
    <nav className="pagination" aria-label="Product pages">
      <button
        type="button"
        className="pagination__arrow"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page === 1}
        aria-label="Previous page"
      >
        <ArrowIcon direction="left" />
      </button>

      {pages.map((entry, i) =>
        entry === '...' ? (
          <span className="pagination__ellipsis" key={`ellipsis-${i}`}>
            …
          </span>
        ) : (
          <button
            key={entry}
            type="button"
            className={`pagination__page${entry === page ? ' is-active' : ''}`}
            onClick={() => onPageChange(entry)}
            aria-current={entry === page ? 'page' : undefined}
          >
            {entry}
          </button>
        ),
      )}

      <button
        type="button"
        className="pagination__arrow"
        onClick={() => onPageChange(Math.min(pageCount, page + 1))}
        disabled={page === pageCount}
        aria-label="Next page"
      >
        <ArrowIcon direction="right" />
      </button>
    </nav>
  )
}

function getPageList(page, pageCount) {
  const pages = new Set([1, pageCount, page, page - 1, page + 1])
  const sorted = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b)

  const result = []
  let prev = null
  for (const p of sorted) {
    if (prev !== null && p - prev > 1) result.push('...')
    result.push(p)
    prev = p
  }
  return result
}

function ArrowIcon({ direction }) {
  const d = direction === 'left' ? 'M10 3L5 8l5 5' : 'M6 3l5 5-5 5'
  return (
    <svg width="14" height="14" viewBox="0 0 15 16" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default Pagination
