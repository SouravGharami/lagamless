import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import EditorialImage from '../EditorialImage.jsx'
import { HOME_IMAGES } from '../../data/homeImages.js'
import './Hero.css'

const AUTOPLAY_MS = 5000

const STORY_TAGS = [
  'GEN Z',
  'MILLENNIALS',
  'TRADITIONAL',
  'STREETWEAR',
  'MINIMAL',
  'CREATORS',
  'EVERYONE',
]

/**
 * Slide layout settings (desktop unless noted). The photo is NOT stretched
 * to fill the banner — it sits bottom-right at its natural proportions and
 * fades into the black on its left/top edges, so the copy panel gets clean
 * dark space and nobody's face ends up behind text.
 *
 *   ratio  – aspect ratio of the visible photo box. Use the file's own ratio
 *            to show the whole photo, or a wider number to trim the bottom
 *            (slide 2 does this to drop its painted-in icon strip).
 *   width  – photo width as a % of the banner width. Bigger = photo further
 *            left (closer to the copy); smaller = more black on the left.
 *   pos    – object-position when `ratio` crops the photo.
 *   fadeX / fadeY – how far (in % of the photo) the left / top edge
 *            dissolves into black. Raise fadeX if the photo's left edge
 *            has bright detail that fights the copy.
 *   focal  – object-position on tablet/mobile, where the photo is cropped
 *            into a square-ish frame above the copy instead.
 *   story  – show the "Different People…" list on the right. Turned off for
 *            slides whose right side already carries painted-in wall text.
 */
const SLIDES = [
  {
    image: HOME_IMAGES.hero,
    kicker: 'OVERSIZED',
    headline: 'IS A CULTURE.',
    sub: 'A CHOICE. NOT A BODY TYPE.',
    copy: "For the dreamers, the creators, the tradition lovers, the street minds, the minimal souls, the bold, the different. It's for everyone.",
    ratio: 2.813,
    width: 85,
    pos: '50% 50%',
    fadeX: 14,
    fadeY: 15,
    focal: '46% 30%',
    story: true,
  },
  {
    image: HOME_IMAGES.heroSlide2,
    kicker: 'SAME ROOTS',
    headline: 'DIFFERENT',
    sub: 'STORIES.',
    copy: 'Different generations, same spirit — good people, better days, for everyone.',
    ratio: 2.02,
    width: 66,
    pos: '50% 0%',
    fadeX: 22,
    fadeY: 18,
    focal: '46% 55%',
    story: false,
  },
  {
    image: HOME_IMAGES.heroSlide3,
    kicker: 'LAGAMLESS',
    headline: 'BETTER',
    sub: 'TOGETHER.',
    copy: 'Same people, different worlds, one story — different souls, same home.',
    ratio: 1.777,
    width: 70,
    pos: '50% 50%',
    fadeX: 26,
    fadeY: 18,
    focal: '56% 40%',
    story: true,
  },
  {
    image: HOME_IMAGES.heroSlide4,
    kicker: 'CREATE / EXPLORE / BELONG',
    headline: 'SAME PASSION,',
    sub: 'DIFFERENT PEOPLE.',
    copy: 'Good ideas, good company, better days — a culture for everyone.',
    ratio: 1.777,
    width: 70,
    pos: '50% 50%',
    fadeX: 24,
    fadeY: 16,
    focal: '50% 35%',
    story: false,
  },
]

/**
 * Homepage hero — autoplaying multi-slide carousel with a left brand
 * statement and (on slides that have room for it) a right-aligned
 * "different people, same culture" list. The whole photo surface is one
 * clickable link to /shop; the dots sit on top as a sibling so clicking a
 * dot controls the carousel without triggering navigation.
 *
 * Every slide's copy is rendered in the same grid cell and cross-faded, so
 * the banner keeps a constant height (no page jump on mobile when one
 * slide has more text than another).
 */
function Hero() {
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
      className="hero"
      onMouseEnter={() => clearInterval(timerRef.current)}
      onMouseLeave={restartTimer}
    >
      <Link to="/shop" className="hero__media" aria-label="Shop the LAGAMLESS collection">
        {SLIDES.map((s, i) => (
          <div
            key={s.headline + s.sub}
            className={`hero__slide ${i === index ? 'hero__slide--active' : ''}`}
            style={{
              '--img-ratio': s.ratio,
              '--img-w': `${s.width}cqw`,
              '--pos': s.pos,
              '--fade-x': `${s.fadeX}%`,
              '--fade-y': `${s.fadeY}%`,
              '--focal': s.focal,
            }}
          >
            <EditorialImage image={s.image} className="hero__image" />
          </div>
        ))}
        <div className="hero__scrim" />
      </Link>

      <div className="hero__content">
        {SLIDES.map((s, i) => {
          const active = i === index
          const Headline = active ? 'h1' : 'div'
          return (
            <div
              key={s.headline + s.sub}
              className={`hero__copy-block ${active ? 'hero__copy-block--active' : ''}`}
              aria-hidden={!active}
            >
              <p
                className={`hero__kicker ${s.kicker.length > 12 ? 'hero__kicker--eyebrow' : ''}`}
              >
                {s.kicker}
              </p>
              <Headline className="hero__headline">
                {s.headline}
                <span className="hero__headline-sub">{s.sub}</span>
              </Headline>
              <p className="hero__copy">{s.copy}</p>
              <div className="hero__actions">
                <Link to="/shop" className="hero__btn hero__btn--solid" tabIndex={active ? 0 : -1}>
                  Shop now
                </Link>
                <Link to="/shop" className="hero__btn hero__btn--outline" tabIndex={active ? 0 : -1}>
                  Our story
                </Link>
              </div>
            </div>
          )
        })}
      </div>

      <div
        className={`hero__story ${SLIDES[index].story ? '' : 'hero__story--hidden'}`}
        aria-hidden={!SLIDES[index].story}
      >
        <p className="hero__story-line">Different People</p>
        <p className="hero__story-line">Different Stories</p>
        <p className="hero__story-line hero__story-line--accent">Same Culture.</p>
        <ul className="hero__story-tags">
          {STORY_TAGS.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      </div>

      <div className="hero__dots">
        {SLIDES.map((s, i) => (
          <button
            key={s.headline + s.sub}
            type="button"
            className={`hero__dot ${i === index ? 'hero__dot--active' : ''}`}
            onClick={(e) => handleDot(e, i)}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>
    </section>
  )
}

export default Hero
