import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Container from '../components/Container.jsx'
import Section from '../components/Section.jsx'
import Breadcrumbs from '../components/Breadcrumbs.jsx'
import ProductCard from '../components/ProductCard.jsx'
import Button from '../components/Button.jsx'
import ProductGridSkeleton from '../components/shop/ProductGridSkeleton.jsx'
import { useWishlist } from '../context/WishlistContext.jsx'
import { getAllProducts } from '../services/products.js'
import './Wishlist.css'

/**
 * Saved items. The wishlist stores product ids only (see WishlistContext), so this page looks each one up
 * in the live catalogue — price and stock are always current, and a product that no longer exists is skipped.
 */
function Wishlist() {
  const { ids, clear } = useWishlist()
  const [products, setProducts] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    document.title = 'Wishlist — LAGAMLESS'
    let alive = true
    getAllProducts()
      .then((list) => { if (alive) setProducts(list) })
      .catch(() => { if (alive) setError(true) })
    return () => { alive = false }
  }, [])

  // Keep the order the customer saved them in (most recent last -> show newest first).
  const saved = useMemo(() => {
    if (!products) return []
    const byId = new Map(products.map((p) => [p.id, p]))
    return [...ids].reverse().map((id) => byId.get(id)).filter(Boolean)
  }, [products, ids])

  return (
    <Section className="wishlist-page">
      <Container>
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Wishlist' }]} />
        <header className="wishlist-page__head">
          <h1 className="text-h2">Your wishlist</h1>
          {ids.length > 0 && (
            <button type="button" className="wishlist-page__clear" onClick={clear}>Clear all</button>
          )}
        </header>

        {error && <p className="wishlist-page__note" role="alert">Could not load your saved items. Please refresh and try again.</p>}

        {!error && products === null && ids.length > 0 && <ProductGridSkeleton count={Math.min(ids.length, 4)} />}

        {!error && (ids.length === 0 || (products && saved.length === 0)) && (
          <div className="wishlist-page__empty">
            <svg width="44" height="44" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M9 15.5S2.5 11.6 2.5 6.9A3.4 3.4 0 019 5a3.4 3.4 0 016.5 1.9c0 4.7-6.5 8.6-6.5 8.6z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
            </svg>
            <h2 className="text-h3">Nothing saved yet</h2>
            <p>Tap the heart on any T-shirt to keep it here for later.</p>
            <Link to="/shop"><Button variant="primary">Browse the collection</Button></Link>
          </div>
        )}

        {saved.length > 0 && (
          <div className="shop-grid shop-grid--comfort wishlist-page__grid">
            {saved.map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
        )}
      </Container>
    </Section>
  )
}

export default Wishlist
