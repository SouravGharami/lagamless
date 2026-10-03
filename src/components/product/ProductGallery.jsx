import { useEffect, useRef, useState } from 'react'
import { getRecoloredImage } from '../../lib/recolorImage.js'
import './ProductGallery.css'

const LABELS = {
  main: 'Front',
  front: 'Front',
  back: 'Back',
  model: '3/4 Front',
  side: 'Side',
  three_quarter_back: '3/4 Back',
  detail: 'Detail',
  fabric: 'Fabric',
}

/**
 * @param {{ images: import('../../data/products.js').ProductImages, order: string[], productName: string, tintColor?: string | null }} props
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
function ProductGallery({ images, order, productName, tintColor = null }) {
  const available = order.filter((key) => images[key])
  const [activeKey, setActiveKey] = useState(available[0] ?? 'main')
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

  useEffect(() => {
    if (!tintColor) return undefined
    let cancelled = false

    Promise.all(
      order
        .filter((key) => images[key]?.src)
        .map((key) =>
          getRecoloredImage(images[key].src, tintColor)
            .then((dataUrl) => [key, dataUrl])
            .catch(() => [key, null]),
        ),
    ).then((entries) => {
      if (cancelled) return
      const next = {}
      for (const [key, dataUrl] of entries) {
        if (dataUrl) next[key] = dataUrl
      }
      lastGoodRef.current = next
      setRecolored(next)
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tintColor, images, order])

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
  const activeLabel = LABELS[activeKey] ?? activeKey

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
                  <img
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
                  />
                ) : null}
              </span>
              <span className="visually-hidden">{LABELS[key] ?? key} view</span>
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
        {activeSrc ? (
          <img
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
          />
        ) : (
          <div key={activeKey} className="product-gallery__placeholder">
            <span>LAGAMLESS</span>
            <span className="product-gallery__placeholder-view">{LABELS[activeKey] ?? activeKey}</span>
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

      {lightboxOpen && (
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
                    aria-label={`${LABELS[key] ?? key} view`}
                  >
                    {thumbSrc && <img src={thumbSrc} alt="" loading="lazy" decoding="async" />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
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
