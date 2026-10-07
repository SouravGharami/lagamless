import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import './BrandIntro.css'

const SEEN_KEY = 'lagamless.intro.seen'
const TOTAL_MS = 4000 // reveal -> tagline -> culture line -> exit (see BrandIntro.css timeline)
const REDUCED_TOTAL_MS = 1500
const EXIT_MS = 650
const IMAGE_WAIT_MS = 1200 // never hold the intro back longer than this for the logo image

/** Shown once per browser session, on a customer-facing first load only (never the admin panel). */
function shouldPlay(pathname) {
  if (typeof window === 'undefined') return false
  if (pathname.startsWith('/admin')) return false
  try {
    if (window.sessionStorage.getItem(SEEN_KEY)) return false
    window.sessionStorage.setItem(SEEN_KEY, '1')
  } catch {
    /* storage blocked: still play once per page load */
  }
  return true
}

/**
 * Cinematic LAGAMLESS intro: black stage -> logo/horse reveal -> GET OUT OF YOUR LAGAM ->
 * OVERSIZED IS A CULTURE. NOT A BODY TYPE. -> dissolve into the homepage that is already rendered underneath.
 * Pure CSS animation (transform/opacity only), one 90 KB image. Tap, click, Enter or Escape skips it.
 */
function BrandIntro() {
  const { pathname } = useLocation()
  const [play] = useState(() => shouldPlay(pathname))
  const [ready, setReady] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [done, setDone] = useState(false)
  const timers = useRef([])

  const finish = useCallback(() => {
    setLeaving((was) => {
      if (!was) timers.current.push(setTimeout(() => setDone(true), EXIT_MS))
      return true
    })
  }, [])

  // Start the timeline once the logo is decoded (or after a short wait), so the reveal never starts on an empty image.
  useEffect(() => {
    if (!play) return undefined
    const fallback = setTimeout(() => setReady(true), IMAGE_WAIT_MS)
    timers.current.push(fallback)
    return () => { timers.current.forEach(clearTimeout); timers.current = [] }
  }, [play])

  useEffect(() => {
    if (!play || !ready) return undefined
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    timers.current.push(setTimeout(finish, (reduced ? REDUCED_TOTAL_MS : TOTAL_MS) - EXIT_MS))
    return undefined
  }, [play, ready, finish])

  // Lock page scroll while the intro covers the screen.
  useEffect(() => {
    if (!play || done) return undefined
    const root = document.documentElement
    const previous = root.style.overflow
    root.style.overflow = 'hidden'
    return () => { root.style.overflow = previous }
  }, [play, done])

  useEffect(() => {
    if (!play || done) return undefined
    const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') finish() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [play, done, finish])

  if (!play || done) return null

  return (
    <div
      className={`brand-intro${ready ? ' is-ready' : ''}${leaving ? ' is-leaving' : ''}`}
      onClick={finish}
      role="presentation"
      aria-hidden="true"
    >
      <div className="brand-intro__beam" />
      <div className="brand-intro__floor" />

      <div className="brand-intro__stage">
        <div className="brand-intro__logo">
          <div className="brand-intro__glow" />
          <div className="brand-intro__logo-mask">
            <img
              className="brand-intro__img"
              src="/images/intro-logo.webp"
              alt=""
              width="900"
              height="616"
              decoding="async"
              fetchpriority="high"
              onLoad={() => setReady(true)}
              onError={() => setReady(true)}
            />
          </div>
        </div>

        <p className="brand-intro__tagline">
          <span className="brand-intro__rule" />
          <span className="brand-intro__tagline-text">Get out of your lagam</span>
          <span className="brand-intro__rule" />
        </p>

        <p className="brand-intro__culture">Oversized is a culture</p>
        <p className="brand-intro__sub">Not a body type</p>
      </div>

      <div className="brand-intro__loader">
        <span className="brand-intro__bar" />
        <span className="brand-intro__loading">Loading…</span>
      </div>
    </div>
  )
}

export default BrandIntro
