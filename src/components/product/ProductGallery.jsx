import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getGarmentRecoloredImage, prewarmGarmentColors } from '../../lib/garmentRecolor/index.js'
import { garmentMaskUrlFor } from '../../lib/garmentRecolor/maskPaths.js'
import TrimmedImg from '../TrimmedImg.jsx'
import './ProductGallery.css'

/** Gallery slots that are close-ups of the fabric/print: the garment fills the frame, there is no backdrop. */
const CLOSE_UP_KEYS = new Set(['detail', 'fabric'])

/**
 * @param {{ images: import('../../data/products.js').ProductImages, order: string[], productName: string, tintColor?: string | null, tintPalette?: string[] | null, baseColor?: string | null }} props
 *
 * `tintPalette`: the hex of every color a shopper can switch to; when given, the recolored photos are precomputed in
 * the background so picking a color is instant. Recoloring only touches the T-shirt fabric (via the garment mask) —
 * artwork, texture, folds, lighting and background are preserved (see src/lib/garmentRecolor/core.js).
 *
 * `baseColor`: the T-shirt's colour as photographed (swatch #1). Every gallery photo is recolored on its OWN pixels —
 * a flat shot, a person wearing it, a close-up — and this tells the recolor which colour in each photo is the shirt
 * (rather than guessing "the biggest colour"), so the switch works on whichever image is active, not just the first.
 *
 * `tintColor` (Part 12): when set, every photo in the gallery — the active
 * image and every thumbnail — is recolored to this exact hex using
 * getRecoloredImage() (see src/lib/recolorImage.js for how), simulating
 * the shopper's selected color option without needing a separate photo
 * per color. Pass `null`/omit for "show the photos exactly as uploaded"
 * (used for the first, "as photographed" color — see getProductColors()
 * in productColor.js).
 *
 * Presentation (redesign): the gallery now reads as a single premium
 * "studio frame" — every photo, whatever its native background, sits on
 * the same warm neutral stage so a mixed batch of mockups looks like one
 * consistent shoot instead of a row of mismatched crops. A vertical
 * thumbnail rail (desktop) / horizontal filmstrip (mobile) sits beside
 * it, hover-zoom previews fabric/print detail without leaving the page,
 * and a click opens a true full-screen lightbox for the "does this look
 * exactly like the photo" close look shoppers want before they buy.
 */
function ProductGallery({ images, order, productName, tintColor = null, tintPalette = null, baseColor = null }) {
  // Only slots that really have a picture. A slot with no src (or whose file fails to load) is dropped everywhere —
  // thumbnail rail, arrows, dots, counter and lightbox — so there is never an empty box.
  const [broken, setBroken] = useState({}) // { [src]: true } for photo files that could not be loaded
  const markBroken = (src) => setBroken((prev) => (prev[src] ? prev : { ...prev, [src]: true }))
  const hasPicture = (key) => {
    const src = images[key]?.src
    return typeof src === 'string' && src.trim() !== '' && !broken[src]
  }
  const available = order.filter(hasPicture)
  const [activeKey, setActiveKey] = useState(available[0] ?? 'main')
  const activeKeyRef = useRef(activeKey)
  activeKeyRef.current = activeKey
  useEffect(() => {
    if (available.length > 0 && !available.includes(activeKey)) setActiveKey(available[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available.join('|'), activeKey])
  const touchStartX = useRef(null)

  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [isZooming, setIsZooming] = useState(false)
  const [zoomOrigin, setZoomOrigin] = useState('50% 50%')
  const [lightboxZoomed, setLightboxZoomed] = useState(false)
  const stageRef = useRef(null)

  // Recolored data URLs for the current tintColor, keyed by image key.
  // getRecoloredImage() itself caches by (src, hex) for the whole session,
  // so switching back to a color already viewed resolves instantly; this
  // component-level cache additionally keeps the *previous* color's
  // recolored images on screen while a newly-picked color is still being
  // computed, instead of flashing back to the plain, uncolored photo.
  const [recolored, setRecolored] = useState({}) // { [key]: dataUrl }
  const lastGoodRef = useRef({}) // { [key]: dataUrl } for the last color that finished

  /** Per-photo recolor options: the known shirt colour, whether it is a close-up, and how urgent the request is. */
  function recolorOpts(key, priority) {
    // maskSrc: this image's OWN saved garment mask (front, back, side, detail… each has its own)
    return { fabricHint: baseColor, fillsFrame: CLOSE_UP_KEYS.has(key), maskSrc: garmentMaskUrlFor(images[key]?.src), priority }
  }

  useEffect(() => {
    if (!tintColor) return undefined
    let cancelled = false

    // The photo on screen first, then the rest. Each image swaps in as soon as ITS recolor is ready (instant when it
    // was pre-warmed) instead of waiting for the whole gallery.
    const keys = order.filter(hasPicture)
    keys.sort((a, b) => (a === activeKeyRef.current ? -1 : b === activeKeyRef.current ? 1 : 0))
    keys.forEach((key) => {
      // the photo on screen is urgent (10); the rest follow (5)
      getGarmentRecoloredImage(images[key].src, tintColor, recolorOpts(key, key === activeKeyRef.current ? 10 : 5))
        .then((dataUrl) => {
          if (cancelled || !dataUrl) return
          lastGoodRef.current = { ...lastGoodRef.current, [key]: dataUrl }
          setRecolored((prev) => ({ ...prev, [key]: dataUrl }))
        })
        .catch(() => {})
    })

    return () => {
      cancelled = true
      // a new color is about to replace this one: drop entries so a slow image never shows the PREVIOUS color's
      // result as if it were the new one (lastGoodRef still covers the in-between frame)
      setRecolored({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tintColor, images, order, baseColor])

  // Background pre-computation for every color the shopper can pick, so choosing one is instant.
  useEffect(() => {
    if (!tintPalette || tintPalette.length === 0) return undefined
    const srcs = order.filter(hasPicture).sort((a, b) => (a === activeKeyRef.current ? -1 : b === activeKeyRef.current ? 1 : 0)).map((key) => images[key].src)
    // same per-photo options as the real requests, so a warmed result is the one the gallery asks for
    const closeUpSrcs = new Set(order.filter((key) => CLOSE_UP_KEYS.has(key) && images[key]?.src).map((key) => images[key].src))
    return prewarmGarmentColors(srcs, tintPalette, (src) => ({ fabricHint: baseColor, fillsFrame: closeUpSrcs.has(src), maskSrc: garmentMaskUrlFor(src) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, order, tintPalette?.join('|'), baseColor])

  // Whichever photo is on screen gets its recolor first. Selecting a thumbnail (or arrow/swipe) while a color is picked
  // asks for THAT photo's recolor right away — it jumps the queue if still pending and is retried if an earlier attempt
  // failed — instead of relying on the batch started when the color was chosen.
  useEffect(() => {
    if (!tintColor) return undefined
    const src = images[activeKey]?.src
    if (!src) return undefined
    let cancelled = false
    getGarmentRecoloredImage(src, tintColor, recolorOpts(activeKey, 10))
      .then((dataUrl) => {
        if (cancelled || !dataUrl) return
        lastGoodRef.current = { ...lastGoodRef.current, [activeKey]: dataUrl }
        setRecolored((prev) => (prev[activeKey] === dataUrl ? prev : { ...prev, [activeKey]: dataUrl }))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, tintColor, images, baseColor])

  /** The src to actually render for a gallery image key, given the current color. */
  function resolvedSrc(key) {
    const original = images[key]?.src
    if (!original) return null
    if (!tintColor) return original
    // Prefer the freshly-computed recolor; while a just-picked color is
    // still being processed, fall back to the previous color's already-
    // computed image rather than the uncolored original, so switching
    // colors never flashes back to "as photographed" mid-transition.
    return recolored[key] ?? lastGoodRef.current[key] ?? original
  }

  const activeIndex = Math.max(available.indexOf(activeKey), 0)
  const activeImage = images[activeKey] ?? images.main
  const activeSrc = resolvedSrc(activeKey)
  // Photos can be uploaded in any order, so never claim "Front"/"Back": just number them.
  const activeLabel = `Look ${activeIndex + 1}`

  function goTo(index) {
    const next = available[(index + available.length) % available.length]
    setActiveKey(next)
    setLightboxZoomed(false)
  }

  function selectKey(key) {
    setActiveKey(key)
    setLightboxZoomed(false)
  }

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX
  }

  function handleTouchEnd(e) {
    if (touchStartX.current === null) return
    const delta = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    const SWIPE_THRESHOLD = 40
    if (delta > SWIPE_THRESHOLD) goTo(activeIndex - 1)
    else if (delta < -SWIPE_THRESHOLD) goTo(activeIndex + 1)
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowLeft') goTo(activeIndex - 1)
    if (e.key === 'ArrowRight') goTo(activeIndex + 1)
    if (e.key === 'Enter' || e.key === ' ') setLightboxOpen(true)
  }

  // Hover-zoom (desktop, fine pointers only — see the CSS media query that
  // gates the resulting classes/cursor to `(hover: hover) and (pointer: fine)`
  // so touch devices never get a "stuck" zoomed image after a tap).
  function handleStageMouseMove(e) {
    const node = stageRef.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setZoomOrigin(`${Math.min(100, Math.max(0, x))}% ${Math.min(100, Math.max(0, y))}%`)
  }

  // Lightbox keyboard controls (Escape to close, arrows to navigate).
  useEffect(() => {
    if (!lightboxOpen) return undefined
    function onKeyDown(e) {
      if (e.key === 'Escape') setLightboxOpen(false)
      if (e.key === 'ArrowLeft') goTo(activeIndex - 1)
      if (e.key === 'ArrowRight') goTo(activeIndex + 1)
    }
    window.addEventListener('keydown', onKeyDown)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxOpen, activeIndex])

  return (
    <div className="product-gallery" id="gallery">
      <div className="product-gallery__thumbs" role="tablist" aria-label="Product images">
        {available.map((key) => {
          const thumbSrc = resolvedSrc(key)
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeKey === key}
              className={`product-gallery__thumb${activeKey === key ? ' product-gallery__thumb--active' : ''}`}
              onClick={() => selectKey(key)}
            >
              <span className="product-gallery__thumb-frame">
                {thumbSrc ? (
                  <TrimmedImg
                    key={`${key}:${tintColor ?? 'original'}`}
                    src={thumbSrc}
                    alt=""
                    // Thumbnails are secondary — the active image above is
                    // already the one actually being looked at. Lazy-loading
                    // these means the browser only fetches them as the user
                    // scrolls them into view (or, on most browsers, shortly
                    // after the main content settles) instead of downloading
                    // every gallery image up front just because its thumbnail
                    // exists in the DOM.
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                    onError={() => markBroken(images[key].src)}
                  />
                ) : null}
              </span>
              <span className="visually-hidden">Look {available.indexOf(key) + 1}</span>
            </button>
          )
        })}
      </div>

      <div
        ref={stageRef}
        className="product-gallery__main"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onKeyDown={handleKeyDown}
        onMouseMove={handleStageMouseMove}
        onMouseEnter={() => setIsZooming(true)}
        onMouseLeave={() => setIsZooming(false)}
        onClick={() => setLightboxOpen(true)}
        tabIndex={0}
        role="group"
        aria-label={`${productName} images`}
      >
        {activeSrc && (
          <div
            className="product-gallery__backdrop"
            style={{ backgroundImage: `url(${JSON.stringify(activeSrc)})` }}
            aria-hidden="true"
          />
        )}
        {activeSrc ? (
          <TrimmedImg
            key={`${activeKey}:${tintColor ?? 'original'}`}
            src={activeSrc}
            alt={activeImage.alt}
            className={`product-gallery__img${isZooming ? ' product-gallery__img--zoomed' : ''}`}
            style={{ transformOrigin: zoomOrigin }}
            // The active gallery image is the Product Details page's LCP
            // candidate — load it eagerly and at high priority instead of
            // letting the browser's default heuristics (which assume
            // below-the-fold) delay it.
            loading="eager"
            decoding="async"
            fetchPriority="high"
            onError={() => markBroken(images[activeKey]?.src)}
          />
        ) : (
          <div key={activeKey} className="product-gallery__placeholder">
            <span>LAGAMLESS</span>
            <span className="product-gallery__placeholder-view">Look {activeIndex + 1}</span>
          </div>
        )}

        <span className="product-gallery__zoom-hint" aria-hidden="true">
          <ZoomIcon /> View full size
        </span>

        <div className="product-gallery__caption" aria-hidden="true">
          <span className="product-gallery__caption-count">
            {String(activeIndex + 1).padStart(2, '0')} / {String(available.length).padStart(2, '0')}
          </span>
          <span className="product-gallery__caption-label">{activeLabel}</span>
        </div>

        {available.length > 1 && (
          <>
            <button
              type="button"
              className="product-gallery__nav product-gallery__nav--prev"
              aria-label="Previous image"
              onClick={(e) => {
                e.stopPropagation()
                goTo(activeIndex - 1)
              }}
            >
              <ChevronIcon direction="prev" />
            </button>
            <button
              type="button"
              className="product-gallery__nav product-gallery__nav--next"
              aria-label="Next image"
              onClick={(e) => {
                e.stopPropagation()
                goTo(activeIndex + 1)
              }}
            >
              <ChevronIcon direction="next" />
            </button>
            <div className="product-gallery__dots" aria-hidden="true">
              {available.map((key, i) => (
                <span key={key} className={`product-gallery__dot${i === activeIndex ? ' product-gallery__dot--active' : ''}`} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Rendered into <body>: inside the page the lightbox was trapped in the gallery's stacking context / transformed
          ancestors, so the buy button and WhatsApp bubble drew OVER it and `fixed` was positioned against the wrong box. */}
      {lightboxOpen && typeof document !== 'undefined' && createPortal(
        <div className="product-gallery__lightbox" role="dialog" aria-modal="true" aria-label={`${productName} — full size images`}>
          <button
            type="button"
            className="product-gallery__lightbox-backdrop"
            aria-label="Close full size view"
            onClick={() => setLightboxOpen(false)}
          />

          <div className="product-gallery__lightbox-top">
            <span className="product-gallery__lightbox-title">{productName}</span>
            <button type="button" className="product-gallery__lightbox-close" onClick={() => setLightboxOpen(false)} aria-label="Close">
              <CloseIcon />
            </button>
          </div>

          <div
            className="product-gallery__lightbox-stage"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {activeSrc && (
              <img
                key={`${activeKey}:${tintColor ?? 'original'}:lightbox`}
                src={activeSrc}
                alt={activeImage.alt}
                className={`product-gallery__lightbox-img${lightboxZoomed ? ' product-gallery__lightbox-img--zoomed' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setLightboxZoomed((z) => !z)
                }}
              />
            )}

            {available.length > 1 && (
              <>
                <button
                  type="button"
                  className="product-gallery__nav product-gallery__nav--prev product-gallery__nav--lightbox"
                  aria-label="Previous image"
                  onClick={() => goTo(activeIndex - 1)}
                >
                  <ChevronIcon direction="prev" />
                </button>
                <button
                  type="button"
                  className="product-gallery__nav product-gallery__nav--next product-gallery__nav--lightbox"
                  aria-label="Next image"
                  onClick={() => goTo(activeIndex + 1)}
                >
                  <ChevronIcon direction="next" />
                </button>
              </>
            )}
          </div>

          <div className="product-gallery__lightbox-bottom">
            <span className="product-gallery__lightbox-count">
              {String(activeIndex + 1).padStart(2, '0')} / {String(available.length).padStart(2, '0')} · {activeLabel}
            </span>
            <div className="product-gallery__lightbox-thumbs">
              {available.map((key) => {
                const thumbSrc = resolvedSrc(key)
                return (
                  <button
                    key={key}
                    type="button"
                    className={`product-gallery__lightbox-thumb${activeKey === key ? ' product-gallery__lightbox-thumb--active' : ''}`}
                    onClick={() => selectKey(key)}
                    aria-label={`Look ${available.indexOf(key) + 1}`}
                  >
                    {thumbSrc && <img src={thumbSrc} alt="" loading="eager" decoding="async" onError={() => markBroken(images[key].src)} />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

function ChevronIcon({ direction }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      {direction === 'prev' ? (
        <path d="M11 3.5 5.5 9l5.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M7 3.5 12.5 9 7 14.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  )
}

function ZoomIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M12 12 16 16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M8 5.5v5M5.5 8h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export default ProductGallery
