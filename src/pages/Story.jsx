import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Reveal from '../components/Reveal.jsx'
import './Story.css'

/**
 * "Our Story" (/about) — a black, cinematic scroll story.
 * All the words live in the constants below so copy can be edited without touching layout.
 * Photography is the existing campaign set in /public/images (nothing new to upload).
 */

const MANIFESTO =
  'Clothes should never ask you to shrink. Oversized isn’t a size — it’s freedom. Room to move, room to be loud, room to be exactly who you are. That’s where LAGAMLESS starts, and it’s why we call it more than clothing. A culture.'

// Words in the manifesto that glow gold once lit.
const MANIFESTO_GOLD = new Set(['freedom.', 'culture.'])

const MOMENTS = ['Puja pandals', 'Rooftop addas', 'Sunset walks', 'Last-bench friendships', 'Late-night lanes', 'Odd records']

const RULES = [
  { title: 'Oversized is freedom', text: 'Fit is a feeling, not a measurement. We cut for room, drape and ease first.' },
  { title: 'Culture in every thread', text: 'Puja pandals, rooftop addas, sunset walks — where we’re from shows up in what we make.' },
  { title: 'Good things take time', text: 'We would rather drop it right than drop it fast. Every tee earns its place.' },
  { title: 'Everyone belongs', text: 'Different people. Same vision. If you’re making something, you’re already one of us.' },
]

const CHAPTERS = [
  {
    roman: 'I',
    name: 'Roots',
    title: 'Same roots. Different stories.',
    text: 'Every pandal, every lane, every late-night adda taught us the same thing: culture isn’t a costume. It’s how you carry where you’re from — and still walk somewhere new. So our Puja capsules sit right beside our streetwear, never behind glass.',
    image: '/images/hero-2.webp',
    alt: 'Friends in LAGAMLESS tees gathered at a Durga Puja pandal at dusk',
    focal: '52% 50%',
  },
  {
    roman: 'II',
    name: 'Streets',
    title: 'Built for the way you move.',
    text: 'Drop shoulders. Room in the body. A drape that moves when you do. We start oversized and work outward — comfort first, attitude a very close second — so a LAGAMLESS tee feels as good on the fifth wear as the first.',
    image: '/images/beyond-trends-campaign.jpg',
    alt: 'Five people seen from behind in different LAGAMLESS graphic and logo tees against a concrete wall',
    focal: '50% 40%',
  },
  {
    roman: 'III',
    name: 'Together',
    title: 'Different souls. Same home.',
    text: 'A tee is rarely worn alone. It shows up on sunset walks, first dates, rooftop evenings and last-bench friendships. We design for the people standing next to you as much as for you.',
    image: '/images/hero-3.webp',
    alt: 'A couple in LAGAMLESS tees watching the sunset beside a bridge',
    focal: '46% 50%',
  },
  {
    roman: 'IV',
    name: 'Belong',
    title: 'Create. Explore. Belong.',
    text: 'Artists, skaters, coders, dreamers, collectors of odd records. Same passion, different people. The drops are ours — the story is always yours.',
    image: '/images/hero-4.webp',
    alt: 'A creator in a LAGAMLESS tee working at a studio desk surrounded by posters and records',
    focal: '48% 50%',
  },
]

/** Words light up one by one as the statement scrolls through the middle of the screen. */
function Manifesto() {
  const ref = useRef(null)
  const words = MANIFESTO.split(' ')
  const [lit, setLit] = useState(0)

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setLit(words.length)
      return undefined
    }
    let raf = 0
    const update = () => {
      raf = 0
      const node = ref.current
      if (!node) return
      const r = node.getBoundingClientRect()
      const vh = window.innerHeight
      // 0 when the block's top reaches 80% of the screen, 1 when its bottom reaches 60%.
      const start = vh * 0.8
      const end = vh * 0.6 - r.height
      const p = (start - r.top) / (start - end)
      setLit(Math.round(Math.min(1, Math.max(0, p)) * words.length))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [words.length])

  return (
    <p className="st-manifesto__text" ref={ref}>
      {words.map((w, i) => (
        <span key={i} className={`${i < lit ? 'is-lit' : ''}${MANIFESTO_GOLD.has(w) ? ' is-gold' : ''}`}>
          {w}{' '}
        </span>
      ))}
    </p>
  )
}

function Story() {
  const photoRef = useRef(null)

  useEffect(() => {
    document.title = 'Our Story — LAGAMLESS'
  }, [])

  // Hero photo drifts slower than the page — one quiet parallax, skipped for reduced motion.
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    let raf = 0
    const tick = () => {
      raf = 0
      const node = photoRef.current
      if (!node) return
      const y = Math.min(window.scrollY, 900)
      node.style.setProperty('--shift', `${y * 0.12}px`)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(tick)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <main className="story-page">
      {/* ---- Hero ---- */}
      <section className="st-hero" aria-labelledby="st-title">
        <div className="container st-hero__top">
          <p className="st-label">Our story</p>
          <h1 className="st-hero__title" id="st-title">
            <span className="st-hero__line"><span>Same people.</span></span>
            <span className="st-hero__line st-hero__line--b"><span><em>Different stories.</em></span></span>
          </h1>
        </div>

        <div className="st-hero__photo" ref={photoRef}>
          <img
            src="/images/hero-1.webp"
            alt="Four friends in oversized LAGAMLESS tees sitting together against a city backdrop"
            fetchPriority="high"
            decoding="async"
          />
          <p className="st-hero__script">More than clothing. A culture.</p>
        </div>
      </section>

      {/* ---- Manifesto ---- */}
      <section className="st-manifesto" id="idea" aria-label="The idea">
        <div className="container st-manifesto__inner">
          <p className="st-label">The idea</p>
          <Manifesto />
        </div>
      </section>

      {/* ---- Moments marquee ---- */}
      <div className="st-marquee" aria-hidden="true">
        <div className="st-marquee__track">
          {[...MOMENTS, ...MOMENTS].map((m, i) => (
            <span key={i}>{m}<i /></span>
          ))}
        </div>
      </div>

      {/* ---- Rules ---- */}
      <section className="st-rules" aria-labelledby="st-rules-title">
        <div className="container st-rules__inner">
          <Reveal className="st-rules__head">
            <p className="st-label">What we stand for</p>
            <h2 className="st-h2" id="st-rules-title">Four things we never compromise on.</h2>
          </Reveal>
          <ul className="st-rules__list">
            {RULES.map((r, i) => (
              <Reveal as="li" key={r.title} className="st-rule" delay={i * 70}>
                <h3 className="st-rule__title">{r.title}</h3>
                <p className="st-rule__text">{r.text}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* ---- Chapters ---- */}
      <section className="st-chapters" aria-label="Our story, in four chapters">
        <ol className="st-chapters__list">
          {CHAPTERS.map((c) => (
            <li key={c.roman} className="st-scene">
              <div className="st-scene__pic">
                <img src={c.image} alt={c.alt} loading="lazy" style={{ objectPosition: c.focal }} />
              </div>
              <div className="st-scene__shade" aria-hidden="true" />
              <div className="container st-scene__inner">
                <p className="st-scene__no" aria-label={`Chapter ${c.roman}, ${c.name}`}>
                  <b aria-hidden="true">{c.roman}</b>
                  <span aria-hidden="true">{c.name}</span>
                </p>
                <div className="st-scene__copy">
                  <h3 className="st-scene__title">{c.title}</h3>
                  <p className="st-scene__text">{c.text}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ---- Who it's for ---- */}
      <section className="st-for" aria-label="Who LAGAMLESS is for">
        <div className="container st-for__inner">
          <Reveal className="st-for__photo">
            <img
              src="/images/more-than-a-story.webp"
              alt="Portrait of a model in a black oversized LAGAMLESS tee with the LL mark"
              loading="lazy"
              width="916"
              height="1024"
            />
          </Reveal>
          <div className="st-for__copy">
            <p className="st-label">Who it’s for</p>
            <Reveal as="p" className="st-for__line">For the dreamers.</Reveal>
            <Reveal as="p" className="st-for__line" delay={100}>The creators.</Reveal>
            <Reveal as="p" className="st-for__line st-for__line--gold" delay={200}>The different ones.</Reveal>
            <Reveal as="p" className="st-for__note" delay={300}>
              Not just a fit. A movement — and there’s a place in it with your name on it.
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---- Closing ---- */}
      <section className="st-end" aria-labelledby="st-end-title">
        <img className="st-end__img" src="/images/hero-campaign.jpg" alt="" loading="lazy" aria-hidden="true" />
        <div className="st-end__shade" aria-hidden="true" />
        <div className="container st-end__inner">
          <Reveal>
            <p className="st-label">Your turn</p>
            <h2 className="st-end__title" id="st-end-title">Wear the story.</h2>
            <div className="st-end__actions">
              <Link to="/shop" className="st-btn st-btn--solid">Shop all tees</Link>
              <Link to="/collections" className="st-btn">Explore collections</Link>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  )
}

export default Story
