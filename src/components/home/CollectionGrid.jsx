import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Reveal from '../Reveal.jsx'
import EditorialImage from '../EditorialImage.jsx'
import { HOME_IMAGES } from '../../data/homeImages.js'
import './CollectionGrid.css'

// Seven "mood" tiles. Each one opens the Shop filtered to that category —
// /shop?collection=<slug> — and the Shop shows the products an admin ticked
// for it (Admin → Add / Edit product → Where this product appears).
// The slugs come from src/data/collections.js; keep them in sync there.
//
// `focal` is the object-position used to keep the subject's face in frame
// as the tile changes width (desktop) or is cropped taller/narrower
// (mobile). Nudge it if you swap in different photography.
export const TILES = [
  { slug: 'gen-z', eyebrow: 'For', title: 'Gen Z', blurb: 'Bolder fits. Louder stories.', image: HOME_IMAGES.catGenZ, focal: '50% 25%' },
  { slug: 'millennials', eyebrow: 'For', title: 'Millennials', blurb: 'Timeless style. Modern living.', image: HOME_IMAGES.catMillennials, focal: '50% 30%' },
  { slug: 'durga-puja', eyebrow: '', title: 'Durga Puja Collection', blurb: 'Tradition meets streetwear.', image: HOME_IMAGES.catDurgaPuja, focal: '50% 40%' },
  { slug: 'pop-culture', eyebrow: 'For', title: 'Pop Culture Fans', blurb: 'Music. Art. Movies. Inspiration everywhere.', image: HOME_IMAGES.catPopCulture, focal: '50% 35%' },
  { slug: 'minimal-lovers', eyebrow: 'For', title: 'Minimal Lovers', blurb: 'Less noise. More meaning.', image: HOME_IMAGES.catMinimal, focal: '50% 30%' },
  { slug: 'streetwear-heads', eyebrow: 'For', title: 'Streetwear Heads', blurb: 'Bigger fits. Bigger attitude.', image: HOME_IMAGES.catStreetwear, focal: '50% 45%' },
  { slug: 'new-arrivals', eyebrow: 'New', title: 'Arrivals', blurb: 'Fresh drops. New stories.', image: HOME_IMAGES.catNewArrivals, focal: '50% 45%' },
]

// How long the pointer has to rest on a tile before it opens. Stops the
// strip from flickering when the cursor sweeps across several tiles.
const HOVER_INTENT_MS = 80

/**
 * "For everyone" mood strip.
 *
 * Desktop: an accordion — one tile is always open (in full colour, with its
 * blurb and Explore button showing) and the rest sit narrower in
 * monochrome. Hover or keyboard-focus a tile to open it. The strip never
 * "rests" in an all-equal state, so it always looks composed.
 *
 * Tablet / mobile: a swipeable carousel with every caption visible.
 *
 * The whole tile is the link (to /shop?collection=<slug>), not just the small button.
 *
 * `variant="shop"` is the same strip, reused at the top of the Shop page: shorter, with a small heading, the tile of
 * the category being viewed (`activeSlug`) kept open and marked "Showing", and — on phones — scrolled into view.
 */
function CollectionGrid({ variant = 'home', activeSlug = null }) {
  const selectedIndex = TILES.findIndex((t) => t.slug === activeSlug)
  const [active, setActive] = useState(selectedIndex >= 0 ? selectedIndex : 0)
  const intentRef = useRef(null)
  const gridRef = useRef(null)
  const isShop = variant === 'shop'

  // The open tile follows the chosen category (and returns to it when the pointer leaves the strip).
  useEffect(() => {
    if (selectedIndex >= 0) setActive(selectedIndex)
  }, [selectedIndex])

  // Phones: slide the carousel so the chosen category is in view.
  useEffect(() => {
    if (!isShop || selectedIndex < 0) return
    const grid = gridRef.current
    const cell = grid?.children[selectedIndex]
    if (!grid || !cell || grid.scrollWidth <= grid.clientWidth + 4) return
    grid.scrollTo({ left: cell.offsetLeft - (grid.clientWidth - cell.offsetWidth) / 2, behavior: 'smooth' })
  }, [selectedIndex, isShop])

  const open = (index, delay = 0) => {
    clearTimeout(intentRef.current)
    if (delay === 0) {
      setActive(index)
      return
    }
    intentRef.current = setTimeout(() => setActive(index), delay)
  }

  const cancelIntent = () => clearTimeout(intentRef.current)

  useEffect(() => () => clearTimeout(intentRef.current), [])

  return (
    <section className={`collection-grid${isShop ? ' collection-grid--shop' : ''}`} aria-label="Shop by mood">
      {isShop && (
        <header className="collection-grid__head">
          <p className="collection-grid__kicker">
            <span aria-hidden="true" />
            Shop by mood
          </p>
          <h2 className="collection-grid__heading">Find your vibe.</h2>
        </header>
      )}
      <Reveal className="collection-grid__reveal">
        <ul
          className="collection-grid__grid"
          ref={gridRef}
          onMouseLeave={() => {
            cancelIntent()
            if (isShop) setActive(selectedIndex >= 0 ? selectedIndex : 0)
          }}
        >
          {TILES.map((tile, index) => (
            <li
              key={tile.slug}
              className={`collection-grid__cell ${index === active ? 'is-active' : ''}${isShop && index === selectedIndex ? ' is-selected' : ''}`}
              style={{ '--i': index, '--focal': tile.focal }}
              onMouseEnter={() => open(index, HOVER_INTENT_MS)}
              onFocus={() => open(index)}
            >
              <Link
                to={`/shop?collection=${tile.slug}`}
                className="collection-grid__card"
                aria-current={isShop && index === selectedIndex ? 'true' : undefined}
              >
                {/* Decorative here — the visible title names the link. */}
                <EditorialImage
                  image={{ ...tile.image, alt: '' }}
                  className="collection-grid__image"
                />
                <div className="collection-grid__scrim" />

                <span className="collection-grid__index" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                {isShop && index === selectedIndex && <span className="collection-grid__selected">Showing</span>}
                <span className="collection-grid__arrow" aria-hidden="true">→</span>

                <div className="collection-grid__caption">
                  {tile.eyebrow && (
                    <span className="collection-grid__eyebrow">{tile.eyebrow}</span>
                  )}
                  <span className="collection-grid__title">{tile.title}</span>
                  <span className="collection-grid__reveal-group">
                    <span className="collection-grid__blurb">{tile.blurb}</span>
                    <span className="collection-grid__explore">
                      Explore <span aria-hidden="true">→</span>
                    </span>
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  )
}

export default CollectionGrid
