import { Link } from 'react-router-dom'
import { formatPrice } from '../lib/formatPrice.js'
import { getAvailability } from '../data/products.js'
import './ProductCard.css'

/**
 * @param {{ product: import('../data/products.js').Product, index?: number }} props
 * `index` is optional and purely presentational — it renders a catalog-style
 * serial number (01, 02, ...) based on position in whatever grid renders it.
 */
function ProductCard({ product, index }) {
  const number = typeof index === 'number' ? String(index + 1).padStart(2, '0') : null
  const availability = getAvailability(product)
  const soldOut = availability === 'sold-out'
  const onSale = typeof product.compareAtPrice === 'number' && product.compareAtPrice > product.price

  // A secondary image (model shot, falling back to the back view) is used
  // for the hover cross-fade. If neither exists yet, the card just keeps
  // showing the main image/placeholder.
  const secondaryImage = product.images?.model?.src ? product.images.model : product.images?.back

  return (
    <Link
      to={`/product/${product.slug}`}
      className={`product-card${soldOut ? ' product-card--sold-out' : ''}`}
    >
      <div className="product-card__image">
        {product.images?.main?.src ? (
          <img src={product.images.main.src} alt={product.images.main.alt} loading="lazy" className="product-card__img product-card__img--main" />
        ) : (
          <div className="product-card__placeholder" aria-hidden="true">
            <span className="product-card__placeholder-mark">LAGAMLESS</span>
          </div>
        )}

        {secondaryImage?.src && (
          <img
            src={secondaryImage.src}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="product-card__img product-card__img--secondary"
          />
        )}

        <div className="product-card__badges">
          {product.isNewArrival && !soldOut && <span className="tag product-card__badge">New</span>}
          {onSale && !soldOut && <span className="tag product-card__badge">Sale</span>}
          {soldOut && <span className="tag product-card__badge product-card__badge--muted">Sold out</span>}
          {!soldOut && availability === 'low-stock' && (
            <span className="tag product-card__badge product-card__badge--muted">Low stock</span>
          )}
        </div>

        {number && <span className="product-card__number">{number}</span>}
      </div>

      <div className="product-card__info">
        <div className="product-card__heading">
          <span className="product-card__name">{product.name}</span>
          <span className="product-card__sku">{product.productNumber}</span>
        </div>

        <div className="product-card__price-row">
          <span className="text-small product-card__price">{formatPrice(product.price)}</span>
          {onSale && (
            <span className="text-small product-card__compare-price">{formatPrice(product.compareAtPrice)}</span>
          )}
        </div>

        {product.sizes?.length > 0 && (
          <ul className="product-card__sizes" aria-label="Available sizes">
            {product.sizes.map((size) => {
              const variant = product.variants.find((v) => v.size === size)
              const outOfStock = !variant || variant.stock === 0
              return (
                <li
                  key={size}
                  className={`product-card__size${outOfStock ? ' product-card__size--out' : ''}`}
                >
                  {size}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Link>
  )
}

export default ProductCard
