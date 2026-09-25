import { useEffect, useState } from 'react'
import Container from '../Container.jsx'
import Button from '../Button.jsx'
import ProductCard from '../ProductCard.jsx'
import Reveal from '../Reveal.jsx'
import { getHomepageProducts } from '../../services/products.js'
import { HOMEPAGE_FEATURED_LIMIT } from '../../data/collections.js'
import './FeaturedProducts.css'

/**
 * "Featured tees" — an editorial-grade homepage product wall. Sits tight
 * against the sections above/below (no `<Section>` wrapper — padding is
 * owned entirely by FeaturedProducts.css) and leads with a bold, numbered
 * masthead-style header rather than a plain heading + link.
 *
 * Shows ONLY products an admin ticked "Show in Featured Tees" on (Admin →
 * Add / Edit product → Where this product appears). If none are ticked, the
 * whole section is hidden rather than showing an empty wall.
 */
function FeaturedProducts() {
  // null = still loading, [] = loaded but nothing is tagged.
  const [products, setProducts] = useState(null)

  useEffect(() => {
    // Only the products tagged "Featured Tees" in the admin — see getHomepageProducts.
    getHomepageProducts(HOMEPAGE_FEATURED_LIMIT).then(setProducts)
  }, [])

  // Nothing tagged: hide the section instead of leaving a header over an empty grid.
  if (products && products.length === 0) return null

  const count = products?.length ?? 0

  return (
    <section className="featured-products">
      <Container>
        <div className="featured-products__header">
          <Reveal className="featured-products__heading-block">
            <span className="featured-products__kicker">
              <span className="featured-products__kicker-dot" aria-hidden="true" />
              New drop
            </span>
            <h2 className="featured-products__headline">
              Featured <em>Tees</em>
            </h2>
            <p className="featured-products__eyebrow">Handpicked for your everyday story.</p>
          </Reveal>

          <div className="featured-products__meta">
            {count > 0 && (
              <span className="featured-products__count">
                <span className="featured-products__count-num">{String(count).padStart(2, '0')}</span> pieces
              </span>
            )}
            <Button to="/shop" variant="ghost" className="featured-products__cta">
              View all <span aria-hidden="true">→</span>
            </Button>
          </div>
        </div>

        <div className="featured-products__marquee" aria-hidden="true">
          <div className="featured-products__marquee-track">
            {Array.from({ length: 2 }).map((_, loop) => (
              <div className="featured-products__marquee-group" key={loop}>
                {['Oversized Fits', 'Limited Drop', 'Made For Movement', 'Everyday Armour'].map((phrase) => (
                  <span className="featured-products__marquee-item" key={phrase}>
                    {phrase}
                    <span className="featured-products__marquee-dot">✦</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="product-grid">
          {(products ?? []).map((product, index) => (
            <Reveal key={product.id} delay={index * 60} className="product-grid__slot">
              <ProductCard product={product} index={index} />
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  )
}

export default FeaturedProducts
