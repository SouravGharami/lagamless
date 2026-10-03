import { Link } from 'react-router-dom'
import Reveal from '../Reveal.jsx'
import EditorialImage from '../EditorialImage.jsx'
import { HOME_IMAGES } from '../../data/homeImages.js'
import './CultureManifesto.css'

// This banner links through to the "Durga Puja Collection" — an admin
// tags a product for it the same way as any other homepage collection
// (Admin → Add / Edit product → Where this product appears → Homepage
// categories → "Durga Puja Collection"). Keep this slug in sync with the
// `durga-puja` entry in src/data/collections.js.
const COLLECTION_SLUG = 'durga-puja'

/**
 * "Tradition Meets Today" — the Durga Puja capsule editorial banner.
 *
 * The campaign creative in HOME_IMAGES.pujaBanner is a fully pre-composed
 * banner — headline, lede, CTA, script line and tag list are already laid
 * into the artwork by the design team. So this renders full-bleed as a
 * single image rather than layering a second, live copy of that same text
 * on top. The whole banner is one link through to the collection; the
 * visible words live in the image's alt text, and a visually-hidden
 * heading + lede keep the section meaningful to screen readers and
 * search engines.
 *
 * There is deliberately nothing rendered below the banner on the
 * homepage — no separate "Shop the Puja capsule" product rail.
 */
function CultureManifesto() {
  return (
    <section className="culture">
      <Reveal>
        <Link to={`/shop?collection=${COLLECTION_SLUG}`} className="culture__link" aria-label="Explore the Durga Puja collection — Tradition Meets Today">
          <h2 className="sr-only">Tradition Meets Today.</h2>
          <p className="sr-only">
            This Durga Puja, celebrate your roots with a modern state of
            mind. Culture in every thread: faith, fashion, freedom,
            together.
          </p>
          <EditorialImage image={HOME_IMAGES.pujaBanner} className="culture__bg-image" />
        </Link>
      </Reveal>
    </section>
  )
}

export default CultureManifesto
