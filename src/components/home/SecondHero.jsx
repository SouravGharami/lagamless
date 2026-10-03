import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import EditorialImage from '../EditorialImage.jsx'
import { HOME_IMAGES } from '../../data/homeImages.js'
import './SecondHero.css'

const AUTOPLAY_MS = 4200

const SLIDES = [
  { image: HOME_IMAGES.collectionIntro, eyebrow: '01 — The current edit', line: 'Fresh cuts, dropped weekly.' },
  { image: HOME_IMAGES.campaignDetail, eyebrow: '02 — Construction', line: 'Built to outlast the season.' },
  { image: HOME_IMAGES.philosophy, eyebrow: '03 — Fabric', line: 'Heavyweight cotton, cut for drape.' },
  { image: HOME_IMAGES.lookPrimary, eyebrow: '04 — Styled', line: 'Layered, oversized, worn your way.' },
]

/**
 * Second full-bleed hero on the homepage — replaces the old horizontal
 * "edit, in motion" scroll-snap gallery. Deliberately built as a shorter
 * sibling of the top Hero: same pattern (one clickable <Link to="/shop">
 * wrapping an autoplaying crossfade, progress dots layered on top), but a
 * smaller viewport share and a left-aligned panel of copy so the two heroes
 * read as a matched pair rather than a repeat.
 */
function SecondHero() {
  const [index, setIndex] = useState(0)
  const timerRef = useRef(null)

  const goTo = useCallback((next) => {
    setIndex(((next % SLIDES.length) + SLIDES.length) % SLIDES.length)
  }, [])

  const restartTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    timerRef.current = setInterval(() => {
      setIndex((current) => (current + 1) % SLIDES.length)
    }, AUTOPLAY_MS)
  }, [])

  useEffect(() => {
    restartTimer()
    return () => clearInterval(timerRef.current)
  }, [restartTimer])

  const handleDot = (event, target) => {
    event.preventDefault()
    event.stopPropagation()
    restartTimer()
    goTo(target)
  }

  return (
    <section
      className="second-hero"
      onMouseEnter={() => clearInterval(timerRef.current)}
      onMouseLeave={restartTimer}
    >
      <Link to="/shop" className="second-hero__slides" aria-label="Shop the current LAGAMLESS edit">
        {SLIDES.map((slide, i) => (
          <div key={slide.line} className={`second-hero__slide ${i === index ? 'second-hero__slide--active' : ''}`}>
            <EditorialImage image={slide.image} className="second-hero__image" />
          </div>
        ))}
        <div className="second-hero__scrim" />

        <div className="second-hero__panel">
          <p className="text-label second-hero__eyebrow">{SLIDES[index].eyebrow}</p>
          <p className="text-h1 second-hero__line">{SLIDES[index].line}</p>
          <span className="second-hero__cta">
            Shop this edit <span aria-hidden="true">→</span>
          </span>
        </div>
      </Link>

      <div className="second-hero__dots">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.line}
            type="button"
            className={`second-hero__dot ${i === index ? 'second-hero__dot--active' : ''}`}
            onClick={(e) => handleDot(e, i)}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>
    </section>
  )
}

export default SecondHero
