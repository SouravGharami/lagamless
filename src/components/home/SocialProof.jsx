import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Container from '../Container.jsx'
import Section from '../Section.jsx'
import Reveal from '../Reveal.jsx'
import EditorialImage from '../EditorialImage.jsx'
import { HOME_IMAGES } from '../../data/homeImages.js'
import './SocialProof.css'

// Reuses the site's existing campaign imagery so the strip drops in
// cleanly today and is a straight swap for real tagged customer photos
// later — see the note this section originally carried.
const UGC_IMAGES = [
  HOME_IMAGES.attitudeBold,
  HOME_IMAGES.lookSecondary,
  HOME_IMAGES.attitudeEveryday,
  HOME_IMAGES.campaignDetail,
  HOME_IMAGES.attitudeMinimal,
  HOME_IMAGES.attitudeStatement,
  HOME_IMAGES.lookPrimary,
  HOME_IMAGES.campaignSecondary,
]

const INSTAGRAM_HANDLE = '@lagamless'
const INSTAGRAM_URL = 'https://instagram.com/lagamless'

/**
 * A minimal, widely-recognised camera-and-ring glyph — the standard way
 * sites signal "this links to Instagram" without embedding the actual
 * logo mark.
 */
function InstagramGlyph({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2.75" y="2.75" width="18.5" height="18.5" rx="6" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="4.4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17.35" cy="6.65" r="1.1" fill="currentColor" />
    </svg>
  )
}

function SocialProof() {
  const trackRef = useRef(null)
  const dragRef = useRef({ active: false, startX: 0, startScroll: 0, moved: false })
  const [thumb, setThumb] = useState({ width: 100, left: 0 })

  const updateThumb = () => {
    const node = trackRef.current
    if (!node) return
    const { scrollWidth, clientWidth, scrollLeft } = node
    const widthPct = Math.min(100, (clientWidth / scrollWidth) * 100)
    const maxScroll = scrollWidth - clientWidth
    const scrolledPct = maxScroll > 0 ? (scrollLeft / maxScroll) * 100 : 0
    const leftPct = (scrolledPct / 100) * (100 - widthPct)
    setThumb({ width: widthPct, left: leftPct })
  }

  useEffect(() => {
    updateThumb()
    window.addEventListener('resize', updateThumb)
    return () => window.removeEventListener('resize', updateThumb)
  }, [])

  const scrollBy = (dir) => {
    const node = trackRef.current
    if (!node) return
    node.scrollBy({ left: dir * node.clientWidth * 0.7, behavior: 'smooth' })
  }

  // Click-and-drag scrolling on desktop — the strip already scrolls with
  // touch/trackpad, but a mouse has no native way to "swipe" it.
  function handlePointerDown(event) {
    const node = trackRef.current
    if (!node) return
    dragRef.current = { active: true, startX: event.clientX, startScroll: node.scrollLeft, moved: false }
    node.classList.add('social-proof__track--dragging')
  }

  function handlePointerMove(event) {
    const node = trackRef.current
    const state = dragRef.current
    if (!node || !state.active) return
    const delta = event.clientX - state.startX
    if (Math.abs(delta) > 4) state.moved = true
    node.scrollLeft = state.startScroll - delta
  }

  function endDrag() {
    trackRef.current?.classList.remove('social-proof__track--dragging')
    dragRef.current.active = false
  }

  // A drag that ends over a tile shouldn't also fire that tile's link.
  function handleTileClick(event) {
    if (dragRef.current.moved) {
      event.preventDefault()
      dragRef.current.moved = false
    }
  }

  return (
    <Section className="social-proof">
      <Container>
        <Reveal className="social-proof__header">
          <div className="social-proof__heading-block">
            <span className="social-proof__badge">
              <InstagramGlyph />
            </span>
            <div>
              <h2 className="social-proof__headline">Real People. Real Stories.</h2>
              <p className="text-small social-proof__lede">
                Tag <strong>{INSTAGRAM_HANDLE}</strong> to be featured.
              </p>
            </div>
          </div>

          <div className="social-proof__actions">
            <a
              className="social-proof__follow"
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <InstagramGlyph size={14} />
              Follow
            </a>
            <Link to="/shop" className="social-proof__view-all">
              View community <span aria-hidden="true">→</span>
            </Link>
          </div>
        </Reveal>
      </Container>

      {/* Full-bleed edge-to-edge, unlike the header above — matches the
          reference layout where the photo strip runs to both screen
          edges while the heading keeps the normal page margins. */}
      <div className="social-proof__strip">
        <button
          type="button"
          className="social-proof__nav social-proof__nav--prev"
          onClick={() => scrollBy(-1)}
          aria-label="Scroll previous"
        >
          ‹
        </button>

        <ul
          className="social-proof__track"
          ref={trackRef}
          onScroll={updateThumb}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
        >
          {UGC_IMAGES.map((image, index) => (
            <li key={image.alt} className="social-proof__item">
              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="social-proof__tile"
                onClick={handleTileClick}
                aria-label="View this post on Instagram"
              >
                <EditorialImage image={image} ratio="4 / 5" className="social-proof__image" />
                <span className="social-proof__scrim" aria-hidden="true" />
                <span className="social-proof__tile-glyph" aria-hidden="true">
                  <InstagramGlyph size={16} />
                </span>
                <span className="social-proof__tile-cta" aria-hidden="true">
                  View post <span className="social-proof__tile-arrow">↗</span>
                </span>
                <span className="social-proof__tile-index">{String(index + 1).padStart(2, '0')}</span>
              </a>
            </li>
          ))}
        </ul>

        <button
          type="button"
          className="social-proof__nav social-proof__nav--next"
          onClick={() => scrollBy(1)}
          aria-label="Scroll next"
        >
          ›
        </button>
      </div>

      <Container>
        <div className="social-proof__progress" aria-hidden="true">
          <span
            className="social-proof__progress-thumb"
            style={{ width: `${thumb.width}%`, left: `${thumb.left}%` }}
          />
        </div>
      </Container>
    </Section>
  )
}

export default SocialProof
