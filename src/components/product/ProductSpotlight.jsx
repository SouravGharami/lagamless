import { useEffect, useRef, useState } from 'react'
import { getGarmentRecoloredImage } from '../../lib/garmentRecolor/index.js'
import { garmentMaskUrlFor } from '../../lib/garmentRecolor/maskPaths.js'
import TrimmedImg from '../TrimmedImg.jsx'
import './ProductSpotlight.css'

const CLOSE_UP_KEYS = new Set(['detail', 'fabric'])

const ORDER = ['main', 'front', 'side', 'back', 'model', 'three_quarter_back', 'detail', 'fabric']

/**
 * Photos are uploaded in any order, so a tab must never claim "Front" or "Back". Each tab is a
 * numbered "look" with a name and a product fact that is true whichever photo is showing.
 */
function buildLooks(product, fitGuidance) {
  const fabric = product.fabric ? `${product.fabric}${product.gsm > 0 ? ` — ${product.gsm} GSM` : ''}.` : null
  return [
    { name: 'The Look', text: product.design || 'Designed on purpose — nothing here is an accident.' },
    { name: 'The Feel', text: fabric || 'A fabric chosen to be worn in, not just worn.' },
    { name: 'The Fit', text: `${product.fit ? `${product.fit} fit. ` : ''}${fitGuidance || 'Take your usual size.'}` },
    { name: 'Wear It', text: product.stylingNote || 'Pair it with relaxed cargos or straight denim and let it do the talking.' },
    { name: 'The Care', text: product.care || 'Machine wash cold, inside out. Tumble dry low.' },
    { name: 'Yours', text: 'Found your favourite? Pick your size and make it yours.' },
  ]
}

/**
 * Centre column of the "More than a ___" story section: a product spotlight built
 * from the product's own photos and specs (instead of a generic brand photo).
 * Tabs / swipe switch between real views; a spec strip underneath is read straight
 * from the product data. Follows the selected colour like the main gallery does.
 */
function ProductSpotlight({ product, tintColor = null, baseColor = null, fitGuidance = '', onChooseSize }) {
  const images = product.images || {}
  const [broken, setBroken] = useState({})
  const has = (k) => {
    const s = images[k]?.src
    return typeof s === 'string' && s.trim() !== '' && !broken[s]
  }
  // de-duplicate slots that point to the same file (main/front are often identical)
  const seen = new Set()
  const keys = ORDER.filter((k) => {
    if (!has(k)) return false
    const s = images[k].src
    if (seen.has(s)) return false
    seen.add(s)
    return true
  })

  const [active, setActive] = useState(keys[0])
  const current = keys.includes(active) ? active : keys[0]
  const idx = Math.max(keys.indexOf(current), 0)
  const touchX = useRef(null)
  const tabsRef = useRef(null)
  const [tinted, setTinted] = useState({})

  // keep the active tab in view inside the tab bar (horizontal only, never scrolls the page)
  useEffect(() => {
    const bar = tabsRef.current
    const el = bar?.querySelector('[aria-selected="true"]')
    if (!bar || !el) return
    bar.scrollTo({ left: el.offsetLeft - (bar.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' })
  }, [current])

  useEffect(() => {
    if (!tintColor || !current) return undefined
    const src = images[current].src
    let cancelled = false
    getGarmentRecoloredImage(src, tintColor, {
      fabricHint: baseColor,
      fillsFrame: CLOSE_UP_KEYS.has(current),
      maskSrc: garmentMaskUrlFor(src),
      priority: 10,
    })
      .then((url) => {
        if (!cancelled && url) setTinted((p) => ({ ...p, [`${src}|${tintColor}`]: url }))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, tintColor, baseColor])

  const go = (i) => keys.length > 1 && setActive(keys[(i + keys.length) % keys.length])
  const onEnd = (e) => {
    if (touchX.current === null) return
    const d = e.changedTouches[0].clientX - touchX.current
    touchX.current = null
    if (d > 40) go(idx - 1)
    else if (d < -40) go(idx + 1)
  }

  if (!current) {
    return (
      <div className="spotlight spotlight--empty">
        <img src="/images/more-than-a-story.webp" alt={`${product.name} — brand story`} loading="lazy" decoding="async" />
      </div>
    )
  }

  const rawSrc = images[current].src
  const src = (tintColor && tinted[`${rawSrc}|${tintColor}`]) || rawSrc
  const looks = buildLooks(product, fitGuidance)
  const look = looks[idx] ?? { name: `Look ${idx + 1}`, text: '' }
  const num = String(idx + 1).padStart(2, '0')

  return (
    <div className="spotlight">
      <div className="spotlight__frame">
        <div
          className="spotlight__stage"
          onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
          onTouchEnd={onEnd}
        >
          <div className="spotlight__backdrop" style={{ backgroundImage: `url(${JSON.stringify(src)})` }} aria-hidden="true" />
          <TrimmedImg
            key={current}
            className="spotlight__img"
            src={src}
            alt={images[current].alt || `${product.name} — look ${idx + 1}`}
            loading="lazy"
            decoding="async"
            onError={() => setBroken((p) => ({ ...p, [rawSrc]: true }))}
          />
          <span className="spotlight__corner spotlight__corner--tl" aria-hidden="true" />
          <span className="spotlight__corner spotlight__corner--br" aria-hidden="true" />
          <span className="spotlight__tag">Lookbook — {product.productNumber || product.sku}</span>
          {keys.length > 1 && (
            <>
              <button type="button" className="spotlight__nav spotlight__nav--prev" aria-label="Previous look" onClick={() => go(idx - 1)}>
                ‹
              </button>
              <button type="button" className="spotlight__nav spotlight__nav--next" aria-label="Next look" onClick={() => go(idx + 1)}>
                ›
              </button>
              <span className="spotlight__count" aria-hidden="true">
                {String(idx + 1).padStart(2, '0')} / {String(keys.length).padStart(2, '0')}
              </span>
            </>
          )}
        </div>

        {keys.length > 1 && (
          <div className="spotlight__tabs" role="tablist" aria-label="Product looks" ref={tabsRef}>
            {keys.map((k, i) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={k === current}
                className={`spotlight__tab${k === current ? ' spotlight__tab--active' : ''}`}
                onClick={() => setActive(k)}
              >
                <span className="spotlight__tab-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="spotlight__tab-name">{looks[i]?.name ?? `Look ${i + 1}`}</span>
              </button>
            ))}
          </div>
        )}

        <div className="spotlight__note" key={current} aria-live="polite">
          <div className="spotlight__note-head">
            <p className="spotlight__note-label">
              <span>{num}</span> {look.name}
            </p>
            {onChooseSize && (
              <button type="button" className="spotlight__size-link" onClick={onChooseSize}>
                Choose size <span aria-hidden="true">→</span>
              </button>
            )}
          </div>
          <p className="spotlight__note-text">{look.text}</p>
        </div>
      </div>
    </div>
  )
}

export default ProductSpotlight
