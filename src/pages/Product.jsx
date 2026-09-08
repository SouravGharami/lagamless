import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import Container from '../components/Container.jsx'
import Section from '../components/Section.jsx'
import Button from '../components/Button.jsx'
import ProductCard from '../components/ProductCard.jsx'
import Reveal from '../components/Reveal.jsx'
import ProductGallery from '../components/product/ProductGallery.jsx'
import BuyBeforeExperience from '../components/product/BuyBeforeExperience.jsx'
import StickyBuyBar from '../components/product/StickyBuyBar.jsx'
import { formatPrice } from '../lib/formatPrice.js'
import { getAvailability, getSizeAvailability } from '../data/products.js'
import { getProductBySlug, getRelatedProducts } from '../services/products.js'
import { useCart } from '../context/CartContext.jsx'
import './Product.css'

const GALLERY_ORDER = ['main', 'front', 'back', 'model', 'detail', 'fabric']

const FIT_COPY = {
  Oversized: {
    headline: 'A deliberate oversized fit.',
    body: 'Cut with extra room through the body and a dropped shoulder seam, this piece is built to drape rather than skim. Oversized is the design, not a compromise — it is meant to move with you and layer over anything.',
    guidance: 'Runs generously by design. Take your usual size for the intended drape, or size down one for a slightly closer fit.',
  },
  Boxy: {
    headline: 'A squared, boxy silhouette.',
    body: 'A shorter body-to-shoulder ratio and a squared hem give this piece its block shape. It is meant to sit away from the body rather than follow it — a considered silhouette, not an accident of sizing.',
    guidance: 'True to a boxy fit. Take your usual size — sizing down will shorten the intended proportions.',
  },
  Relaxed: {
    headline: 'A relaxed, easy fit.',
    body: 'Room through the body without going fully oversized — enough structure to hold its shape, enough ease to move freely. Built for layering and for wearing open.',
    guidance: 'Take your usual size. If you prefer a closer silhouette, size down one.',
  },
  Tapered: {
    headline: 'Roomy through the top, tapered at the leg.',
    body: 'Volume up top with a leg line that narrows toward the ankle, so the silhouette stays clean instead of ballooning. The taper is cut in, not added with a hem tie.',
    guidance: 'Take your usual waist size. The taper is built into the pattern, not adjustable.',
  },
}
const DEFAULT_FIT_COPY = {
  headline: 'A considered fit.',
  body: 'Every LAGAMLESS silhouette is designed on purpose — nothing here is a byproduct of sizing shortcuts.',
  guidance: 'Take your usual size unless noted otherwise below.',
}

function Product() {
  const { slug } = useParams()
  // Keying by slug remounts the view whenever the product changes, so all
  // local UI state (selected size, active image, "added" feedback) resets
  // naturally instead of needing manual resets inside an effect.
  return <ProductView key={slug} slug={slug} />
}

function ProductView({ slug }) {
  const [status, setStatus] = useState('loading') // 'loading' | 'found' | 'not-found'
  const [product, setProduct] = useState(null)
  const [related, setRelated] = useState([])
  const [selectedSize, setSelectedSize] = useState(null)
  const [justAdded, setJustAdded] = useState(false)
  const [addFeedback, setAddFeedback] = useState(null)
  const [stickyVisible, setStickyVisible] = useState(false)
  const buyBoxRef = useRef(null)
  const sizeRowRef = useRef(null)
  const { addItem } = useCart()

  useEffect(() => {
    let cancelled = false

    getProductBySlug(slug).then((found) => {
      if (cancelled) return
      if (!found) {
        setStatus('not-found')
        return
      }
      setProduct(found)
      setStatus('found')
      getRelatedProducts(found, 4).then((rel) => {
        if (!cancelled) setRelated(rel)
      })
    })

    return () => {
      cancelled = true
    }
  }, [slug])

  useEffect(() => {
    if (status !== 'found') return undefined
    const node = buyBoxRef.current
    if (!node) return undefined
    const observer = new IntersectionObserver(([entry]) => setStickyVisible(!entry.isIntersecting), {
      rootMargin: '-72px 0px 0px 0px',
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [status])

  if (status === 'loading') {
    return (
      <Section>
        <Container>
          <div className="product-detail product-detail--loading" aria-hidden="true">
            <div className="product-detail__gallery-skeleton" />
            <div className="product-detail__info-skeleton">
              <div className="product-detail__skeleton-line" style={{ width: '40%' }} />
              <div className="product-detail__skeleton-line" style={{ width: '70%', height: '2rem' }} />
              <div className="product-detail__skeleton-line" style={{ width: '25%' }} />
            </div>
          </div>
        </Container>
      </Section>
    )
  }

  if (status === 'not-found') {
    return (
      <Section>
        <Container>
          <div className="product-not-found">
            <p className="text-label">404</p>
            <h1 className="text-h1">We couldn't find that product.</h1>
            <p className="text-lead">
              It may have sold out permanently, been retired from the collection, or the link may
              be incorrect. Head back to the shop to see what's currently available.
            </p>
            <div className="product-not-found__actions">
              <Button to="/shop" variant="primary">
                Back to shop
              </Button>
              <Button to="/" variant="secondary">
                Go home
              </Button>
            </div>
          </div>
        </Container>
      </Section>
    )
  }

  const availability = getAvailability(product)
  const soldOut = availability === 'sold-out'
  const onSale = typeof product.compareAtPrice === 'number' && product.compareAtPrice > product.price
  const selectedSizeAvailability = selectedSize ? getSizeAvailability(product, selectedSize) : null
  const canAdd = Boolean(selectedSize) && selectedSizeAvailability !== 'sold-out' && !soldOut
  const fitCopy = FIT_COPY[product.fit] ?? DEFAULT_FIT_COPY
  const isBottoms = product.category === 'Bottoms'

  function handleAddToBag() {
    if (!canAdd) return
    const result = addItem(product, selectedSize, 1)
    if (result.status === 'unavailable' || result.status === 'capped') {
      setAddFeedback(result.message)
      window.setTimeout(() => setAddFeedback(null), 3000)
      return
    }
    setJustAdded(true)
    window.setTimeout(() => setJustAdded(false), 2000)
  }

  function jumpToSizes() {
    sizeRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <>
      <Section>
        <Container>
          <div className="product-detail">
            <ProductGallery images={product.images} order={GALLERY_ORDER} productName={product.name} />

            <div className="product-detail__info">
              <p className="text-label">LAGAMLESS · {product.category}</p>
              <h1 className="text-h1 product-detail__name">{product.name}</h1>
              <p className="text-small product-detail__meta">
                {product.productNumber} · SKU {product.sku}
              </p>

              <div className="product-detail__price-row">
                <span className="text-h3">{formatPrice(product.price)}</span>
                {onSale && (
                  <span className="text-lead product-detail__compare-price">
                    {formatPrice(product.compareAtPrice)}
                  </span>
                )}
                {onSale && !soldOut && <span className="tag">Sale</span>}
              </div>

              <p className="product-detail__stock-status" data-state={availability}>
                {availability === 'sold-out' && 'Sold out'}
                {availability === 'low-stock' && 'Low stock — almost gone'}
                {availability === 'in-stock' && 'In stock'}
              </p>

              <p className="text-lead product-detail__description">{product.description}</p>

              <div className="product-detail__sizes" ref={sizeRowRef}>
                <div className="product-detail__sizes-header">
                  <span className="text-label">Size</span>
                  {selectedSize && selectedSizeAvailability === 'low-stock' && (
                    <span className="text-small product-detail__size-hint">Only a few left in {selectedSize}</span>
                  )}
                </div>
                <div className="product-detail__size-options">
                  {product.sizes.map((size) => {
                    const sizeAvailability = getSizeAvailability(product, size)
                    const outOfStock = sizeAvailability === 'sold-out'
                    return (
                      <button
                        key={size}
                        type="button"
                        disabled={outOfStock}
                        aria-pressed={selectedSize === size}
                        className={`product-detail__size-btn${selectedSize === size ? ' product-detail__size-btn--active' : ''}${outOfStock ? ' product-detail__size-btn--disabled' : ''}`}
                        onClick={() => setSelectedSize(size)}
                      >
                        {size}
                      </button>
                    )
                  })}
                </div>
                {!selectedSize && !soldOut && (
                  <p className="text-small product-detail__size-required">Select a size to continue</p>
                )}
              </div>

              <div ref={buyBoxRef} id="buy-box">
                <Button
                  variant="primary"
                  block
                  disabled={!canAdd}
                  onClick={handleAddToBag}
                  className="product-detail__add-btn"
                >
                  {soldOut ? 'Sold out' : justAdded ? 'Added ✓' : selectedSize ? 'Add to bag' : 'Select a size'}
                </Button>
                {addFeedback && (
                  <p className="text-small product-detail__add-feedback" role="status">
                    {addFeedback}
                  </p>
                )}
              </div>

              <div className="product-detail__accordions" id="details">
                <AccordionItem title="Description" defaultOpen>
                  <p>{product.description}</p>
                </AccordionItem>
                <AccordionItem title="Product story">
                  <p>{product.story || 'Story notes for this piece are coming soon.'}</p>
                </AccordionItem>
                <AccordionItem title="Fabric">
                  <p>{product.fabric || 'Fabric details are coming soon.'}</p>
                </AccordionItem>
                <AccordionItem title="GSM (fabric weight)">
                  <p>
                    {product.gsm > 0
                      ? `${product.gsm} GSM — ${product.gsm >= 300 ? 'heavyweight' : product.gsm >= 200 ? 'midweight' : 'lightweight'} fabric.`
                      : 'GSM is not applicable for this fabric construction.'}
                  </p>
                </AccordionItem>
                <AccordionItem title="Fit">
                  <p>
                    {product.fit} fit. {fitCopy.guidance}
                  </p>
                </AccordionItem>
                <AccordionItem title="Care">
                  <p>{product.care || 'Machine wash cold, inside out. Do not bleach. Tumble dry low.'}</p>
                </AccordionItem>
                <AccordionItem title="Measurements">
                  <MeasurementsTable product={product} isBottoms={isBottoms} />
                </AccordionItem>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      <Section tight id="fit">
        <Container>
          <Reveal>
            <div className="fit-experience">
              <p className="text-label">Fit experience</p>
              <h2 className="text-h2 fit-experience__headline">{fitCopy.headline}</h2>
              <p className="text-lead fit-experience__body">{fitCopy.body}</p>
              <p className="text-small fit-experience__guidance">{fitCopy.guidance}</p>
            </div>
          </Reveal>
        </Container>
      </Section>

      <Section tight>
        <Container>
          <Reveal>
            <ProductDNA product={product} />
          </Reveal>
        </Container>
      </Section>

      <Container>
        <BuyBeforeExperience product={product} />
      </Container>

      <Section tight id="design-story">
        <Container>
          <Reveal>
            <div className="design-story">
              <p className="text-label">Design story</p>
              <p className="design-story__quote">{product.story}</p>
            </div>
          </Reveal>
        </Container>
      </Section>

      <Section tight id="styling">
        <Container>
          <Reveal>
            <div className="styling-section">
              <div className="styling-section__image">
                {product.images.model?.src ? (
                  <img src={product.images.model.src} alt={product.images.model.alt} />
                ) : (
                  <div className="styling-section__placeholder" aria-hidden="true">
                    <span>LAGAMLESS</span>
                  </div>
                )}
              </div>
              <div className="styling-section__text">
                <p className="text-label">Styling</p>
                <h2 className="text-h2">How to wear it</h2>
                <p className="text-lead">
                  {product.stylingNote ?? 'Campaign styling for this piece is coming soon.'}
                </p>
                <p className="text-small styling-section__note">
                  Full styling and campaign photography will be added here as it becomes available.
                </p>
              </div>
            </div>
          </Reveal>
        </Container>
      </Section>

      {related.length > 0 && (
        <Section tight>
          <Container>
            <h2 className="text-h2 product-detail__related-heading">You may also like</h2>
            <div className="shop-grid">
              {related.map((item, index) => (
                <Reveal key={item.id} delay={index * 60}>
                  <ProductCard product={item} />
                </Reveal>
              ))}
            </div>
          </Container>
        </Section>
      )}

      <StickyBuyBar
        visible={stickyVisible}
        product={product}
        selectedSize={selectedSize}
        soldOut={soldOut}
        canAdd={canAdd}
        justAdded={justAdded}
        onAdd={handleAddToBag}
        onJumpToSizes={jumpToSizes}
      />
    </>
  )
}

function AccordionItem({ title, children, defaultOpen = false }) {
  return (
    <details className="product-detail__accordion" open={defaultOpen}>
      <summary>{title}</summary>
      <div className="product-detail__accordion-body">{children}</div>
    </details>
  )
}

function MeasurementsTable({ product, isBottoms }) {
  return (
    <div className="product-detail__measurements-wrap">
      <table className="product-detail__measurements">
        <thead>
          <tr>
            <th scope="col">Size</th>
            <th scope="col">{isBottoms ? 'Waist (in)' : 'Chest (in)'}</th>
            <th scope="col">Length (in)</th>
            {!isBottoms && <th scope="col">Shoulder (in)</th>}
          </tr>
        </thead>
        <tbody>
          {product.sizes.map((size) => {
            const m = product.measurements[size]
            return (
              <tr key={size}>
                <th scope="row">{size}</th>
                <td>{m?.chest ?? '—'}</td>
                <td>{m?.length ?? '—'}</td>
                {!isBottoms && <td>{m?.shoulder || '—'}</td>}
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="text-small product-detail__measurements-note">
        Measured flat, in inches. A half-inch of variance between units is normal.
      </p>
    </div>
  )
}

function ProductDNA({ product }) {
  const rows = [
    { label: 'Product number', value: product.productNumber },
    { label: 'Fabric', value: product.fabric },
    { label: 'GSM', value: product.gsm > 0 ? `${product.gsm} GSM` : 'N/A' },
    { label: 'Fit', value: product.fit },
    { label: 'Construction', value: product.construction || 'Details coming soon' },
    { label: 'Design', value: product.design || 'Details coming soon' },
    { label: 'Care', value: product.care || 'Machine wash cold. Do not bleach.' },
  ]

  return (
    <div className="product-dna">
      <p className="text-label">Product DNA</p>
      <h2 className="text-h2 product-dna__heading">What it's made of.</h2>
      <dl className="product-dna__grid">
        {rows.map((row) => (
          <div key={row.label} className="product-dna__row">
            <dt className="text-label">{row.label}</dt>
            <dd className="text-small">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export default Product
