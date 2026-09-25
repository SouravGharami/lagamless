import { Link } from 'react-router-dom'
import { HOME_IMAGES } from '../../data/homeImages.js'
import './ShopMovementCTA.css'

/**
 * Closing full-bleed banner on the Shop page.
 *
 * The artwork already contains the "Not just a t-shirt. A movement."
 * headline, the "Explore now" button and the handwritten "Same People /
 * Different Stories / Same Culture." line, so nothing is overlaid in code —
 * the whole banner is a single link to the About page.
 */
function ShopMovementCTA() {
  const image = HOME_IMAGES.shopMovementBanner

  return (
    <section className="shop-movement">
      <Link to="/about" className="shop-movement__link">
        <img
          className="shop-movement__image"
          src={image.src}
          alt={image.alt}
          width={image.width}
          height={image.height}
          loading="lazy"
          decoding="async"
        />
      </Link>
    </section>
  )
}

export default ShopMovementCTA
