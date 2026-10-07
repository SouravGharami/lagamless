import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatPrice } from '../lib/formatPrice.js'
import { getAvailability } from '../data/products.js'
import { useWishlist } from '../context/WishlistContext.jsx'
import { useCart } from '../context/CartContext.jsx'
import { getProductColors } from '../lib/productColor.js'
import './ProductCard.css'

// Tilt/shine only makes sense for a real cursor — checked once, not
// reactively, since hover capability doesn't change mid-session.
const supportsFinePointer =
  typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches

/** A card is a small, fixed space — show at most this many color dots, then "+N". */
const MAX_CARD_SWATCHES = 4

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
  const isBestseller = product.isFeatured && !product.isNewArrival && !onSale && !soldOut

  const { isSaved, toggle } = useWishlist()
  const saved = isSaved(product.id)
  const { addItem } = useCart()
  const colors = getProductColors(product)
  const [justAdded, setJustAdded] = useState(false)

  function handleQuickAdd(event) {
    event.preventDefault()
    event.stopPropagation()
    const firstInStock = product.variants.find((v) => v.stock > 0)?.size ?? product.sizes[0]
    if (!firstInStock) return
    addItem(product, firstInStock, 1)
    setJustAdded(true)
    window.setTimeout(() => setJustAdded(false), 1400)
  }

  // Gentle cursor-tracked tilt + light sheen on the image, à la a held
  // photograph catching the light. Pure CSS custom properties driven from
  // pointer position — no animation library needed.
  const imageRef = useRef(null)
  const [wishlistPulse, setWishlistPulse] = useState(false)

  function handlePointerMove(event) {
    if (!supportsFinePointer || soldOut) return
    const node = imageRef.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    const px = ((event.clientX - rect.left) / rect.width) * 100
    const py = ((event.clientY - rect.top) / rect.height) * 100
    node.style.setProperty('--mx', `${px}%`)
    node.style.setProperty('--my', `${py}%`)
    node.style.setProperty('--rx', `${((50 - py) / 50) * 6}deg`)
    node.style.setProperty('--ry', `${((px - 50) / 50) * 6}deg`)
  }

  function handlePointerLeave() {
    const node = imageRef.current
    if (!node) return
    node.style.setProperty('--mx', '50%')
    node.style.setProperty('--my', '50%')
    node.style.setProperty('--rx', '0deg')
    node.style.setProperty('--ry', '0deg')
  }

  function handleWishlistClick(event) {
    // The heart button sits inside the card's full-bleed <Link> — stop the
    // click from also triggering navigation to the product page.
    event.preventDefault()
    event.stopPropagation()
    toggle(product.id)
    setWishlistPulse(true)
  }

  // A secondary image (model shot, falling back to the back view) is used
  // for the hover cross-fade. If neither exists yet, the card just keeps
  // showing the main image/placeholder.
  const secondaryImage = product.images?.model?.src ? product.images.model : product.images?.back

  // BUGFIX — hover image disappearing: the CSS used to fade the main
  // image out on `:hover` unconditionally, whether or not a secondary
  // image actually existed *and had finished loading*. Two cases went
  // blank: (1) products with no secondary image at all — the main image
  // faded out with nothing behind it; (2) products that DO have one, but
  // it's `loading="lazy"` (kept that way on purpose — see Performance
  // Optimization Pass 01) and simply hadn't downloaded yet when the
  // hover started.
  //
  // `secondaryReady` tracks the one thing CSS can't see on its own:
  // whether the secondary <img> has actually finished loading
  // successfully. It's reflected onto the image container as
  // `product-card__image--has-hover-image` (see ProductCard.css), which
  // is what the hover cross-fade rules now require before they touch the
  // main image's opacity — so the primary image only ever gets hidden
  // once there is a real, loaded image ready to replace it. No eager
  // downloading: this doesn't change *when* the image loads, only when
  // the CSS is allowed to react to it having loaded.
  const [secondaryReady, setSecondaryReady] = useState(false)
  const showHoverImage = Boolean(secondaryImage?.src) && secondaryReady

  return (
    <Link
      to={`/product/${product.slug}`}
      className={`product-card${soldOut ? ' product-card--sold-out' : ''}`}
    >
      <div
        ref={imageRef}
        className={`product-card__image${showHoverImage ? ' product-card__image--has-hover-image' : ''}`}
        onMouseMove={handlePointerMove}
        onMouseLeave={handlePointerLeave}
      >
        {product.images?.main?.src ? (
          <img
            src={product.images.main.src}
            alt={product.images.main.alt}
            loading="lazy"
            decoding="async"
            className="product-card__img product-card__img--main"
          />
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
            decoding="async"
            // The hover cross-fade image is never the first thing shown —
            // let the browser fetch the primary card image first.
            fetchPriority="low"
            // Cached images can fire onLoad essentially immediately; a
            // failed load (or one that's still in flight) simply never
            // flips `secondaryReady` true, so the CSS gate above keeps
            // the primary image showing — see the comment on
            // `secondaryReady`.
            onLoad={() => setSecondaryReady(true)}
            onError={() => setSecondaryReady(false)}
            className="product-card__img product-card__img--secondary"
          />
        )}

        <div className="product-card__badges">
          {product.isNewArrival && !soldOut && <span className="tag product-card__badge">New</span>}
          {onSale && !soldOut && <span className="tag product-card__badge">Sale</span>}
          {isBestseller && <span className="tag product-card__badge">Bestseller</span>}
          {soldOut && <span className="tag product-card__badge product-card__badge--muted">Sold out</span>}
          {!soldOut && availability === 'low-stock' && (
            <span className="tag product-card__badge product-card__badge--muted">Low stock</span>
          )}
        </div>

        <button
          type="button"
          className={`product-card__wishlist${saved ? ' product-card__wishlist--saved' : ''}${wishlistPulse ? ' product-card__wishlist--pulse' : ''}`}
          onClick={handleWishlistClick}
          onAnimationEnd={() => setWishlistPulse(false)}
          aria-pressed={saved}
          aria-label={saved ? 'Remove from saved items' : 'Save for later'}
        >
          <svg viewBox="0 0 20 18" width="18" height="18" aria-hidden="true">
            <path
              d="M10 17S1.5 11.9 1.5 6.2A4.2 4.2 0 0 1 10 4.4a4.2 4.2 0 0 1 8.5 1.8C18.5 11.9 10 17 10 17z"
              fill={saved ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {number && <span className="product-card__number">{number}</span>}

        {!soldOut && <span className="product-card__view" aria-hidden="true">View product</span>}
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

        <span className="product-card__swatches" aria-hidden="true">
          {colors.slice(0, MAX_CARD_SWATCHES).map((c) => (
            <span key={c.name} className="product-card__swatch" style={{ '--swatch': c.hex }} title={c.name} />
          ))}
          {colors.length > MAX_CARD_SWATCHES && (
            <span className="product-card__swatch-more">+{colors.length - MAX_CARD_SWATCHES}</span>
          )}
        </span>

        <div className="product-card__bottom-row">
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

          {!soldOut && (
            <button
              type="button"
              className={`product-card__quick-add${justAdded ? ' product-card__quick-add--added' : ''}`}
              onClick={handleQuickAdd}
              aria-label={`Add ${product.name} to bag`}
            >
              {justAdded ? <CheckIcon /> : <BagIcon />}
            </button>
          )}
        </div>
      </div>
    </Link>
  )
}

function BagIcon() {
  return (
    <svg viewBox="0 0 18 18" width="15" height="15" aria-hidden="true">
      <path d="M4.5 6h9l-.75 8.5a1 1 0 0 1-1 .9H6.25a1 1 0 0 1-1-.9L4.5 6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M6.75 6V4.75a2.25 2.25 0 0 1 4.5 0V6" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 18 18" width="15" height="15" aria-hidden="true">
      <path d="M4 9.5l3 3 7-7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default ProductCard
