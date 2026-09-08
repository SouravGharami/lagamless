import { useRef, useState } from 'react'
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
 * @param {{ images: import('../../data/products.js').ProductImages, order: string[], productName: string }} props
 */
function ProductGallery({ images, order, productName }) {
  const available = order.filter((key) => images[key])
  const [activeKey, setActiveKey] = useState(available[0] ?? 'main')
  const touchStartX = useRef(null)

  const activeIndex = Math.max(available.indexOf(activeKey), 0)
  const activeImage = images[activeKey] ?? images.main

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
        {activeImage?.src ? (
          <img key={activeKey} src={activeImage.src} alt={activeImage.alt} className="product-gallery__img" />
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
        {order.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeKey === key}
            className={`product-gallery__thumb${activeKey === key ? ' product-gallery__thumb--active' : ''}`}
            onClick={() => setActiveKey(key)}
          >
            {images[key]?.src ? (
              <img src={images[key].src} alt="" />
            ) : (
              <span className="product-gallery__thumb-placeholder" aria-hidden="true" />
            )}
            <span className="visually-hidden">{LABELS[key] ?? key} view</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default ProductGallery
