import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import ProductCard from '../ProductCard.jsx'
import Reveal from '../Reveal.jsx'
import './ProductRelated.css'

const ROWS_FIRST = 2 // rows shown straight away
const ROWS_MORE = 2 // rows added each time the shopper reaches the bottom
const LOAD_DELAY_MS = 380 // just long enough for the skeleton row to read as "loading"

/** Columns follow the CSS grid breakpoints (2 / 3 / 4). */
function getColumns() {
  if (typeof window === 'undefined') return 4
  const w = window.innerWidth
  if (w >= 1024) return 4
  if (w >= 640) return 3
  return 2
}

/**
 * "You may also like" — sits right after the story section on the product page.
 *
 * Shows two rows of products straight away and loads two more rows every time
 * the shopper scrolls to the bottom of the grid, for as long as there are
 * products left. Columns: 2 on phones (app-style grid), 3 on tablets, 4 on
 * desktop. Cards are the shop's own <ProductCard />, so wishlist, quick-add,
 * sizes and swatches all work as everywhere else.
 *
 * @param {{ products: object[], currentName?: string, category?: string }} props
 */
function ProductRelated({ products, currentName, category }) {
  const [columns, setColumns] = useState(getColumns)
  const [rows, setRows] = useState(ROWS_FIRST)
  const [loading, setLoading] = useState(false)
  const sentinelRef = useRef(null)
  const timerRef = useRef(null)

  const total = products?.length ?? 0
  const visibleCount = Math.min(total, columns * rows)
  const hasMore = visibleCount < total

  useEffect(() => {
    function onResize() {
      setColumns(getColumns())
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  const loadMore = useCallback(() => {
    if (loading) return
    setLoading(true)
    timerRef.current = window.setTimeout(() => {
      setRows((r) => r + ROWS_MORE)
      setLoading(false)
    }, LOAD_DELAY_MS)
  }, [loading])

  // Reaching the sentinel (a little before the bottom of the grid) loads more.
  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasMore || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore()
      },
      { rootMargin: '0px 0px 320px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, loadMore, visibleCount])

  if (total === 0) return null

  const supportsObserver = typeof IntersectionObserver !== 'undefined'
  const remaining = total - visibleCount

  return (
    <section className="related" aria-labelledby="related-heading">
      <div className="related__inner">
        <Reveal className="related__header">
          <div className="related__titles">
            <p className="related__kicker">
              <span className="related__kicker-line" />
              Keep exploring
            </p>
            <h2 id="related-heading" className="related__headline">
              You may <span className="related__headline-accent">also like.</span>
            </h2>
            <p className="related__sub">
              More from the same culture{currentName ? `, picked to go with ${currentName}` : ''}.
            </p>
          </div>

          <div className="related__tools">
            <span className="related__count">
              {total} {total === 1 ? 'piece' : 'pieces'}
            </span>
            <Link to="/shop" className="related__all">
              View all <ArrowIcon />
            </Link>
          </div>
        </Reveal>

        <ul className="related__grid">
          {products.slice(0, visibleCount).map((item, index) => (
            <li
              key={item.id}
              className="related__item"
              // Only cards that arrive after the first screenful animate in,
              // staggered within their batch.
              style={
                index >= columns * ROWS_FIRST
                  ? { '--enter-delay': `${(index % columns) * 70}ms` }
                  : undefined
              }
              data-late={index >= columns * ROWS_FIRST ? '' : undefined}
            >
              <ProductCard product={item} index={index} />
            </li>
          ))}

          {/* skeleton row while the next batch "loads" */}
          {loading &&
            Array.from({ length: Math.min(columns, remaining) }).map((_, i) => (
              <li key={`sk-${i}`} className="related__item related__skeleton" aria-hidden="true">
                <span className="related__skeleton-img" />
                <span className="related__skeleton-line" />
                <span className="related__skeleton-line related__skeleton-line--short" />
              </li>
            ))}
        </ul>

        {hasMore ? (
          <div className="related__more" ref={sentinelRef}>
            {loading ? (
              <p className="related__status" role="status">
                Loading more…
              </p>
            ) : (
              <button type="button" className="related__more-btn" onClick={loadMore}>
                {supportsObserver ? 'Scroll for more' : 'Show more'}
                <span className="related__more-count">{remaining} more</span>
              </button>
            )}
          </div>
        ) : (
          <div className="related__end">
            <span className="related__end-line" aria-hidden="true" />
            <p>You&rsquo;ve seen everything we picked for you.</p>
            <Link to="/shop" className="related__cta">
              Explore {category ? `all ${category}s` : 'the full collection'}
              <ArrowIcon />
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 10h12M11 5l5 5-5 5" />
    </svg>
  )
}

export default ProductRelated
