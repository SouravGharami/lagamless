import { useEffect, useRef, useState } from 'react'
import { getRecoloredImage } from '../../lib/recolorImage.js'
import './ProductGallery.css'

const LABELS = {
  main: 'Front',
  front: 'Front',
  back: 'Back',
  model: 'Model',
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
 */
function ProductGallery({ images, order, productName, tintColor = null }) {
  const available = order.filter((key) => images[key])
  const [activeKey, setActiveKey] = useState(available[0] ?? 'main')
  const touchStartX = useRef(null)

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

  function goTo(index) {
    const next = available[(index + available.length) % available.length]
    setActiveKey(next)
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
  }

  return (
    <div className="product-gallery" id="gallery">
      <div
        className="product-gallery__main"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="group"
        aria-label={`${productName} images`}
      >
        {activeSrc ? (
          <img
            key={`${activeKey}:${tintColor ?? 'original'}`}
            src={activeSrc}
            alt={activeImage.alt}
            className="product-gallery__img"
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

        {available.length > 1 && (
          <>
            <button
              type="button"
              className="product-gallery__nav product-gallery__nav--prev"
              aria-label="Previous image"
              onClick={() => goTo(activeIndex - 1)}
            >
              ‹
            </button>
            <button
              type="button"
              className="product-gallery__nav product-gallery__nav--next"
              aria-label="Next image"
              onClick={() => goTo(activeIndex + 1)}
            >
              ›
            </button>
            <div className="product-gallery__dots" aria-hidden="true">
              {available.map((key, i) => (
                <span key={key} className={`product-gallery__dot${i === activeIndex ? ' product-gallery__dot--active' : ''}`} />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="product-gallery__thumbs" role="tablist" aria-label="Product images">
        {order.map((key) => {
          const thumbSrc = resolvedSrc(key)
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeKey === key}
              className={`product-gallery__thumb${activeKey === key ? ' product-gallery__thumb--active' : ''}`}
              onClick={() => setActiveKey(key)}
            >
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
              ) : (
                <span className="product-gallery__thumb-placeholder" aria-hidden="true" />
              )}
              <span className="visually-hidden">{LABELS[key] ?? key} view</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default ProductGallery
