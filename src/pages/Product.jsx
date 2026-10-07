import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import Container from '../components/Container.jsx'
import Section from '../components/Section.jsx'
import Button from '../components/Button.jsx'
import ProductRelated from '../components/product/ProductRelated.jsx'
import Reveal from '../components/Reveal.jsx'
import Breadcrumbs from '../components/Breadcrumbs.jsx'
import ProductGallery from '../components/product/ProductGallery.jsx'
import StickyBuyBar from '../components/product/StickyBuyBar.jsx'
import ShareButton from '../components/product/ShareButton.jsx'
import ProductSpotlight from '../components/product/ProductSpotlight.jsx'
import { formatPrice } from '../lib/formatPrice.js'
import { getAvailability, getSizeAvailability } from '../data/products.js'
import { getProductBySlug, getRelatedProducts } from '../services/products.js'
import { getProductColors } from '../lib/productColor.js'
import { useInView } from '../lib/useInView.js'
import { useCart } from '../context/CartContext.jsx'
import { useWishlist } from '../context/WishlistContext.jsx'
import './Product.css'

const GALLERY_ORDER = ['main', 'front', 'side', 'back', 'model', 'three_quarter_back', 'detail', 'fabric']

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

// Singular, readable noun for the "MORE THAN A ___." headline — keeps that
// line honest for whatever's actually being viewed (a hoodie shouldn't say
// "t-shirt") instead of hardcoding one category's copy.
const CATEGORY_NOUN = {
  Tees: 'a t-shirt',
  Hoodies: 'a hoodie',
  Shirts: 'a shirt',
  Outerwear: 'a jacket',
  Bottoms: 'clothing',
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
  const [selectedColorIndex, setSelectedColorIndex] = useState(0)
  // false until the shopper clicks a swatch: until then the photos are shown exactly as uploaded
  const [hasPickedColor, setHasPickedColor] = useState(false)
  const [justAdded, setJustAdded] = useState(false)
  const [addFeedback, setAddFeedback] = useState(null)
  const [stickyVisible, setStickyVisible] = useState(false)
  const buyBoxRef = useRef(null)
  const sizeRowRef = useRef(null)
  const { addItem } = useCart()
  const { isSaved, toggle } = useWishlist()

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

    })

    return () => {
      cancelled = true
    }
  }, [slug])

  // "You may also like" is fetched only when the shopper scrolls near it — not on page load — so the
  // product itself (photos, price, sizes) gets the whole connection first.
  const [relatedRef, relatedNear] = useInView({ rootMargin: '900px 0px' })
  useEffect(() => {
    if (!product || !relatedNear) return undefined
    let cancelled = false
    getRelatedProducts(product, 48).then((rel) => {
      if (!cancelled) setRelated(rel)
    })
    return () => {
      cancelled = true
    }
  }, [product, relatedNear])

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
      <div className="product-page product-page--dark">
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
      </div>
    )
  }

  if (status === 'not-found') {
    return (
      <div className="product-page product-page--dark">
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
      </div>
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

  const colors = getProductColors(product)
  const selectedColor = colors[selectedColorIndex] ?? colors[0]
  // Every swatch the admin set recolors the T-shirt fabric in each photo, including the first one: the first swatch is
  // not guaranteed to be the colour the shirt was photographed in (e.g. a "red" first swatch on a black tee). The
  // recolor engine leaves a photo untouched when the swatch already equals that photo's own shirt colour, and the
  // gallery shows the photos as uploaded until a swatch has actually been picked.
  const galleryTint = hasPickedColor ? selectedColor.hex : null
  // Every color, so the gallery can precompute them and make switching instant.
  const galleryPalette = colors.map((c) => c.hex)
  const saved = isSaved(product.id)
  const categoryNoun = CATEGORY_NOUN[product.category] ?? 'clothing'
  const careIsMachineWash = /machine wash/i.test(product.care || '')
  const { lead: storyLead, paragraphs: storyParagraphs } = splitStory(
    product.story || 'Every LAGAMLESS piece carries a story beyond the fabric — designed on purpose, worn with intent.',
  )
  const discountPercent = onSale
    ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)
    : 0

  return (
    <div className="product-page product-page--dark">
      <Section>
        <Container>
          <Breadcrumbs
            items={[
              { label: 'Home', to: '/' },
              { label: product.category, to: '/shop' },
              { label: product.name },
            ]}
          />

          <div className="product-detail">
            <ProductGallery
              images={product.images}
              order={GALLERY_ORDER}
              productName={product.name}
              tintColor={galleryTint}
              tintPalette={galleryPalette}
              baseColor={colors[0]?.hex ?? null}
            />

            <div className="product-detail__info">
              <header className="product-detail__head">
                <p className="product-detail__eyebrow">
                  <span className="product-detail__eyebrow-line" aria-hidden="true" />
                  LAGAMLESS <i aria-hidden="true">/</i> {product.category}
                </p>
                <h1 className="text-h1 product-detail__name">{product.name}</h1>
                <p className="product-detail__meta">
                  {product.productNumber && <span>No. {product.productNumber}</span>}
                  <span>SKU {product.sku}</span>
                </p>
              </header>

              <div className="product-detail__price-block">
                <div className="product-detail__price-row">
                  <span className="product-detail__price">{formatPrice(product.price)}</span>
                  {onSale && <span className="product-detail__compare-price">{formatPrice(product.compareAtPrice)}</span>}
                  {onSale && !soldOut && <span className="product-detail__sale-tag">{discountPercent}% off</span>}
                </div>
                <div className="product-detail__price-foot">
                  <span className="product-detail__tax-note">Inclusive of all taxes</span>
                  <span className="product-detail__stock-status" data-state={availability}>
                    <span className="product-detail__stock-dot" aria-hidden="true" />
                    {availability === 'sold-out' && 'Sold out'}
                    {availability === 'low-stock' && 'Low stock — almost gone'}
                    {availability === 'in-stock' && 'In stock'}
                  </span>
                </div>
              </div>

              <p className="product-detail__description">{product.description}</p>

              <div className="product-detail__options">
              <div className="product-detail__color">
                <span className="product-detail__label">
                  Color<span className="product-detail__color-selected">{selectedColor.name}</span>
                </span>
                {colors.length > 1 && (
                  <div className="product-detail__color-row" role="group" aria-label="Choose a color">
                    {colors.map((c, index) => (
                      <button
                        key={c.name}
                        type="button"
                        className={`product-detail__color-swatch${index === selectedColorIndex ? ' product-detail__color-swatch--active' : ''}`}
                        style={{ '--swatch': c.hex }}
                        aria-pressed={index === selectedColorIndex}
                        aria-label={c.name}
                        title={c.name}
                        onClick={() => {
                          setSelectedColorIndex(index)
                          setHasPickedColor(true)
                        }}
                      >
                        <TeeSwatchIcon />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="product-detail__sizes" ref={sizeRowRef}>
                <div className="product-detail__sizes-header">
                  <span className="product-detail__label">Size</span>
                  {selectedSize && selectedSizeAvailability === 'low-stock' && (
                    <span className="product-detail__size-hint">Only a few left in {selectedSize}</span>
                  )}
                  <a href="#details" className="product-detail__size-guide-link">
                    <RulerIcon /> Size guide
                  </a>
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
                  <p className="product-detail__size-required">Select a size to continue</p>
                )}
              </div>

              </div>

              <div ref={buyBoxRef} id="buy-box" className="product-detail__buy-row">
                <Button
                  variant="primary"
                  disabled={!canAdd}
                  onClick={handleAddToBag}
                  className="product-detail__add-btn"
                >
                  {soldOut ? 'Sold out' : justAdded ? 'Added ✓' : selectedSize ? 'Add to cart' : 'Select a size'}
                  {!soldOut && <ArrowIcon />}
                </Button>
                <button
                  type="button"
                  className={`product-detail__wishlist-btn${saved ? ' product-detail__wishlist-btn--saved' : ''}`}
                  onClick={() => toggle(product.id)}
                  aria-pressed={saved}
                  aria-label={saved ? 'Remove from saved items' : 'Save for later'}
                >
                  <HeartIcon filled={saved} />
                </button>
              </div>
              <ShareButton product={product} />
              {addFeedback && (
                <p className="text-small product-detail__add-feedback" role="status">
                  {addFeedback}
                </p>
              )}

              <ul className="product-detail__trust-row">
                <li>
                  <span className="product-detail__trust-chip"><TruckIcon /></span>
                  <span>Free shipping <em>above ₹999</em></span>
                </li>
                <li>
                  <span className="product-detail__trust-chip"><ReturnIcon /></span>
                  <span>Easy returns <em>7 days</em></span>
                </li>
                <li>
                  <span className="product-detail__trust-chip"><CashIcon /></span>
                  <span>COD <em>available</em></span>
                </li>
              </ul>
            </div>
          </div>
        </Container>
      </Section>

      <Section tight id="story-feature">
        <Container>
          <Reveal>
            <div className="story-feature">
              <div className="story-feature__main">
              <div className="story-feature__text">
                <div className="story-feature__top">
                  <p className="story-feature__kicker">
                    <span className="story-feature__kicker-line" aria-hidden="true" />
                    The story
                  </p>
                  <span className="story-feature__watermark" aria-hidden="true">
                    {(product.productNumber || 'LGML').replace(/[^A-Za-z0-9]/g, '')}
                  </span>
                </div>
                <h2 className="story-feature__headline">
                  More than
                  <br />
                  <span className="story-feature__headline-accent">{categoryNoun}.</span>
                </h2>
                {storyLead && <p className="story-feature__lead">{storyLead}</p>}
                {storyParagraphs.map((para, i) => (
                  <p key={i} className="story-feature__body">
                    {para}
                  </p>
                ))}
                <button type="button" className="story-feature__cta" onClick={jumpToSizes}>
                  <span>Wear your story</span>
                  <ArrowIcon />
                </button>
              </div>

              <ProductSpotlight
                product={product}
                tintColor={galleryTint}
                baseColor={colors[0]?.hex ?? null}
                fitGuidance={fitCopy.guidance}
                onChooseSize={jumpToSizes}
              />

              <div className="story-feature__details" id="details">
                <p className="story-feature__details-kicker">Good to know</p>
                <div className="product-detail__accordions story-feature__accordions">
                  <AccordionItem index="01" title="Product Details">
                    <p>{product.description}</p>
                  </AccordionItem>
                  <AccordionItem index="02" title="Fabric & GSM">
                    <p>
                      {product.fabric || 'Fabric details are coming soon.'}
                      {product.gsm > 0 ? ` — ${product.gsm} GSM.` : ''}
                    </p>
                  </AccordionItem>
                  <AccordionItem index="03" title="Fit">
                    <p>
                      {product.fit} fit. {fitCopy.guidance}
                    </p>
                  </AccordionItem>
                  <AccordionItem index="04" title="Care Instructions">
                    <p>{product.care || 'Machine wash cold, inside out. Do not bleach. Tumble dry low.'}</p>
                  </AccordionItem>
                  <AccordionItem index="05" title="Size Guide">
                    <MeasurementsTable product={product} isBottoms={isBottoms} />
                  </AccordionItem>
                  <AccordionItem index="06" title="Shipping & Returns">
                    <p>Free shipping on orders above ₹999, with cash on delivery available. Easy returns on eligible items.</p>
                  </AccordionItem>
                </div>
              </div>
              </div>

              <ul className="story-feature__icons">
                <li>
                  <span className="story-feature__icon-chip">
                    <FabricIcon />
                  </span>
                  <span>
                    {product.gsm > 0 ? `${product.gsm} GSM` : 'Premium'}
                    <br />
                    Fabric
                  </span>
                </li>
                <li>
                  <span className="story-feature__icon-chip">
                    <FitIcon />
                  </span>
                  <span>
                    {product.fit}
                    <br />
                    Fit
                  </span>
                </li>
                <li>
                  <span className="story-feature__icon-chip">
                    <StitchIcon />
                  </span>
                  <span>
                    Considered
                    <br />
                    Construction
                  </span>
                </li>
                <li>
                  <span className="story-feature__icon-chip">
                    <BreatheIcon />
                  </span>
                  <span>
                    {careIsMachineWash ? 'Machine' : 'Easy'}
                    <br />
                    Washable
                  </span>
                </li>
              </ul>
            </div>
          </Reveal>
        </Container>
      </Section>

      <div ref={relatedRef} aria-hidden="true" />
      <ProductRelated products={related} currentName={product.name} category={product.category} />

      <Reveal>
        <div className="movement-banner">
          <img
            src="/images/same-people-different-stories.webp"
            alt="Same People, Different Stories — not just a fit, a movement. For the dreamers, the creators, the different ones."
            loading="lazy"
            decoding="async"
          />
        </div>
      </Reveal>

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
    </div>
  )
}

/**
 * Breaks the one-block product story into a short pull-quote (the first sentence, when it is short enough to
 * work as one) plus readable paragraphs of a couple of sentences each, so a narrow column never becomes a wall of text.
 */
function splitStory(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  const sentences = clean.match(/[^.!?]+[.!?]+["”’']*|[^.!?]+$/g)?.map((x) => x.trim()).filter(Boolean) ?? [clean]
  let lead = ''
  let rest = sentences
  if (sentences.length > 1 && sentences[0].length <= 90) {
    lead = sentences[0]
    rest = sentences.slice(1)
  }
  const paragraphs = []
  let cur = ''
  for (const sentence of rest) {
    if (cur && (cur + ' ' + sentence).length > 190) {
      paragraphs.push(cur)
      cur = sentence
    } else {
      cur = cur ? `${cur} ${sentence}` : sentence
    }
  }
  if (cur) paragraphs.push(cur)
  return { lead, paragraphs }
}

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Small garment-shaped glyph used inside each color swatch (see the "Color"
 * row) instead of a plain dot — same idea as most apparel sites' color
 * pickers, where the swatch itself looks like a tiny tee in that color. */
function TeeSwatchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M9 2 4 6l2 4 2-1.5V21h8V8.5L18 10l2-4-5-4-2 2h-2L9 2Z"
        fill="currentColor"
      />
    </svg>
  )
}

function RulerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="2" y="6" width="14" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 6v2.4M8 6v2.4M11 6v2.4M14 6v2.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function HeartIcon({ filled }) {
  return (
    <svg viewBox="0 0 20 18" width="18" height="18" aria-hidden="true">
      <path
        d="M10 17S1.5 11.9 1.5 6.2A4.2 4.2 0 0 1 10 4.4a4.2 4.2 0 0 1 8.5 1.8C18.5 11.9 10 17 10 17z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function TruckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M1.5 5h11v10h-11z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M12.5 9h4l3 3.3V15h-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="5.5" cy="16.5" r="1.6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="16" cy="16.5" r="1.6" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

function ReturnIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M4 11a7 7 0 1 1 2.2 5.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M4 6.5V11h4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CashIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="2" y="5.5" width="18" height="11" rx="1.4" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="11" cy="11" r="2.8" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

function FabricIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3c0 3-3.5 3-3.5 6s3.5 3 3.5 6-3.5 3-3.5 6M17.5 3c0 3-3.5 3-3.5 6s3.5 3 3.5 6-3.5 3-3.5 6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}

function FitIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 4l-4.5 2 1 4L6 9.5V20h12V9.5l1.5.5 1-4L16 4c0 1.7-1.8 3-4 3s-4-1.3-4-3z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function StitchIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 12h3M8 12h3M13 12h3M18 12h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="0 0" />
      <path d="M6 9l0 6M11 9l0 6M16 9l0 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function BreatheIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 8h11a2.5 2.5 0 1 0-2.5-2.5M3 12h15a2.5 2.5 0 1 1-2.5 2.5M3 16h9a2.5 2.5 0 1 0-2.5-2.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}

function AccordionItem({ title, children, defaultOpen = false, index }) {
  return (
    <details className="product-detail__accordion" open={defaultOpen}>
      <summary>
        <span className="product-detail__accordion-heading">
          {index && <span className="product-detail__accordion-index">{index}</span>}
          <span className="product-detail__accordion-title">{title}</span>
        </span>
      </summary>
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

export default Product
