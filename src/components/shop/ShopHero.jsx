import EditorialImage from '../EditorialImage.jsx'
import { HOME_IMAGES } from '../../data/homeImages.js'
import './ShopHero.css'

/**
 * Shop page hero — rebuilt to match the brand's reference banner exactly:
 * a single full-bleed campaign photograph (models weighted right), the
 * "COLLECTION" eyebrow + big italic title + tagline + intro copy + CTA
 * stacked bottom-left, and a handwritten "Different People Same Culture."
 * line with a crown mark top-right. No carousel — this is one fixed
 * scene, same as the reference.
 *
 * @param {{ productCount?: number | null }} props
 */
function ShopHero({ productCount }) {
  return (
    <section className="shop-hero">
      <div className="shop-hero__media">
        <EditorialImage image={HOME_IMAGES.shopHeroCampaign} className="shop-hero__image" />
        <div className="shop-hero__scrim" />
      </div>

      <div className="shop-hero__signature">
        <p className="shop-hero__script">
          Different
          <br />
          People
          <br />
          Same
          <br />
          Culture.
        </p>
        <CrownIcon />
      </div>

      <div className="shop-hero__content">
        <p className="text-label shop-hero__eyebrow">Collection</p>
        <h1 className="shop-hero__title">Oversized T-Shirts</h1>
        <p className="shop-hero__tagline">Same culture. Different stories.</p>
        <p className="shop-hero__intro">
          Premium oversized t-shirts for the dreamers, the creators, the different ones. Not
          just a fit — a mindset.
        </p>

        <a href="#shop-grid" className="btn btn-primary shop-hero__cta">
          Explore collection <span aria-hidden="true">→</span>
        </a>

        {typeof productCount === 'number' && (
          <p className="shop-hero__count">
            <strong>{productCount}</strong>&nbsp;{productCount === 1 ? 'piece' : 'pieces'} in this
            collection
          </p>
        )}
      </div>
    </section>
  )
}

function CrownIcon() {
  return (
    <svg
      className="shop-hero__crown"
      width="34"
      height="26"
      viewBox="0 0 34 26"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 22.5 1 6l7.5 6L17 2l8.5 10L33 6l-2 16.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <line x1="3.5" y1="22.5" x2="30.5" y2="22.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

export default ShopHero
