import { Link } from 'react-router-dom'
import { formatPrice } from '../../lib/formatPrice.js'
import { productPhoto } from '../../lib/collectionInsights.js'
import { getProductColors } from '../../lib/productColor.js'
import { useWishlist } from '../../context/WishlistContext.jsx'
import './TeeTile.css'

/**
 * Compact product tile built for the dark Collections page (the shared ProductCard is designed for light
 * surfaces). Photo, name, price, colour dots, a wishlist heart and a NEW tag — nothing else.
 */
function TeeTile({ product, tag = null }) {
  const { isSaved, toggle } = useWishlist()
  const saved = isSaved(product.id)
  const photo = productPhoto(product)
  const colors = getProductColors(product)
  const onSale = typeof product.compareAtPrice === 'number' && product.compareAtPrice > product.price

  return (
    <article className="tt">
      <Link to={`/product/${product.slug}`} className="tt__link" aria-label={`${product.name}, ${formatPrice(product.price)}`}>
        <div className="tt__media">
          {photo ? <img src={photo} alt="" loading="lazy" draggable="false" /> : <span className="tt__ph">LAGAMLESS</span>}
          {(tag || product.isNewArrival) && <span className="tt__tag">{tag || 'New'}</span>}
        </div>
        <div className="tt__info">
          <h3 className="tt__name">{product.name}</h3>
          <p className="tt__price">
            {formatPrice(product.price)}
            {onSale && <s>{formatPrice(product.compareAtPrice)}</s>}
          </p>
          {colors.length > 1 && (
            <span className="tt__dots" aria-hidden="true">
              {colors.slice(0, 4).map((c) => (
                <i key={c.hex} style={{ background: c.hex }} />
              ))}
            </span>
          )}
        </div>
      </Link>
      <button
        type="button"
        className={`tt__heart${saved ? ' is-on' : ''}`}
        aria-pressed={saved}
        aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
        onClick={() => toggle(product.id)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M12 20.5s-7.5-4.6-9.2-9.3C1.7 8 3.5 4.8 6.8 4.8c1.9 0 3.5 1 5.2 3 1.7-2 3.3-3 5.2-3 3.3 0 5.1 3.2 4 6.4-1.7 4.7-9.2 9.3-9.2 9.3z" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        </svg>
      </button>
    </article>
  )
}

export default TeeTile
