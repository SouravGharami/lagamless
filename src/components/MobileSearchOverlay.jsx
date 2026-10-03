import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllProducts } from '../services/products.js'
import { searchProducts } from '../lib/productQuery.js'
import { formatPrice } from '../lib/formatPrice.js'
import './MobileSearchOverlay.css'

const MAX_RESULTS = 6

/**
 * Full-screen search — the mobile pattern (Instagram/Amazon-style) instead
 * of a dropdown fighting the on-screen keyboard for space. Opened from the
 * bottom tab bar's "Search" tab and the header's search icon; before this,
 * that icon had no handler at all and tapping it did nothing on mobile.
 *
 * Searches the same product list Shop.jsx does (getAllProducts +
 * searchProducts), so results here match what "View all results" lands on.
 *
 * @param {{ open: boolean, onClose: () => void }} props
 */
function MobileSearchOverlay({ open, onClose }) {
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState(null)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return undefined

    document.body.style.overflow = 'hidden'
    // Load lazily, only once this actually opens — and only once overall,
    // the product-service cache makes repeat opens free.
    if (products === null) {
      getAllProducts().then(setProducts)
    }
    const raf = requestAnimationFrame(() => inputRef.current?.focus())

    function onKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKeyDown)
      cancelAnimationFrame(raf)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const results = useMemo(() => {
    if (!products || !query.trim()) return []
    return searchProducts(products, query).slice(0, MAX_RESULTS)
  }, [products, query])

  const totalMatchCount = useMemo(() => {
    if (!products || !query.trim()) return 0
    return searchProducts(products, query).length
  }, [products, query])

  if (!open) return null

  function goToProduct(slug) {
    onClose()
    navigate(`/product/${slug}`)
  }

  function viewAllResults(event) {
    event?.preventDefault()
    onClose()
    navigate(`/shop?q=${encodeURIComponent(query.trim())}`)
  }

  return (
    <div className="search-overlay" role="dialog" aria-modal="true" aria-label="Search products">
      <form className="search-overlay__bar" onSubmit={viewAllResults}>
        <SearchIcon />
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          placeholder="Search products, styles, tags…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="search-overlay__input"
        />
        <button type="button" className="search-overlay__cancel" onClick={onClose}>
          Cancel
        </button>
      </form>

      <div className="search-overlay__body">
        {!query.trim() && (
          <p className="search-overlay__hint">Start typing to search the full catalog.</p>
        )}

        {query.trim() && products === null && (
          <p className="search-overlay__hint">Searching…</p>
        )}

        {query.trim() && products !== null && results.length === 0 && (
          <p className="search-overlay__hint">No products match "{query.trim()}".</p>
        )}

        {results.length > 0 && (
          <>
            <ul className="search-overlay__results">
              {results.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    className="search-overlay__result"
                    onClick={() => goToProduct(product.slug)}
                  >
                    <span className="search-overlay__result-image">
                      {product.images?.main?.src ? (
                        <img src={product.images.main.src} alt="" loading="lazy" />
                      ) : null}
                    </span>
                    <span className="search-overlay__result-info">
                      <span className="search-overlay__result-name">{product.name}</span>
                      <span className="search-overlay__result-price">{formatPrice(product.price)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {totalMatchCount > MAX_RESULTS && (
              <button type="button" className="search-overlay__view-all" onClick={viewAllResults}>
                View all {totalMatchCount} results
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <line x1="12.5" y1="12.5" x2="17" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export default MobileSearchOverlay
