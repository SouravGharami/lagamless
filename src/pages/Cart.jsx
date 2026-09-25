import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Container from '../components/Container.jsx'
import Section from '../components/Section.jsx'
import Button from '../components/Button.jsx'
import Breadcrumbs from '../components/Breadcrumbs.jsx'
import ProductCard from '../components/ProductCard.jsx'
import { useCart } from '../context/CartContext.jsx'
import { formatPrice } from '../lib/formatPrice.js'
import { getFeaturedProducts } from '../services/products.js'
import './Cart.css'

const PAYMENT_METHODS = ['UPI', 'Visa', 'Mastercard', 'RuPay', 'Amex']

function Cart() {
  const { lines, removeItem, updateQuantity, getLineStock, clearCart, subtotal } = useCart()
  const [related, setRelated] = useState([])

  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0)

  // "You might also like" — reuses the same featured-products read the
  // homepage/shop rails use, then filters out anything already sitting in
  // the bag so the rail never suggests what's already been added.
  useEffect(() => {
    let cancelled = false
    getFeaturedProducts(8).then((items) => {
      if (cancelled) return
      const inCartIds = new Set(lines.map((line) => line.productId))
      setRelated(items.filter((item) => !inCartIds.has(item.id)).slice(0, 4))
    })
    return () => {
      cancelled = true
    }
  }, [lines])

  if (lines.length === 0) {
    return (
      <div className="cart-page cart-page--dark">
        <Section>
          <Container>
            <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Cart' }]} />
            <p className="text-label">Bag</p>
            <h1 className="text-h1" style={{ marginTop: '1rem' }}>
              Your bag is empty.
            </h1>
            <p className="text-lead" style={{ marginTop: '1.5rem', maxWidth: '52ch' }}>
              Nothing here yet. Browse the collection and add something you actually want to wear.
            </p>
            <Button to="/shop" variant="primary" style={{ marginTop: '2rem' }}>
              Continue shopping
            </Button>
          </Container>
        </Section>
      </div>
    )
  }

  return (
    <div className="cart-page cart-page--dark">
      {/* ---- Hero banner ---- */}
      <div className="cart-hero">
        <div className="cart-hero__media">
          <img
            src="/images/cart-hero-banner.webp"
            alt="Your bag — good choices hit different. More than clothing. A culture."
            width="2170"
            height="725"
            loading="eager"
            decoding="async"
            fetchPriority="high"
          />
        </div>
        <h1 className="visually-hidden">Your bag</h1>
      </div>

      <div className="cart-hero__breadcrumbs">
        <Container>
          <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Cart' }]} />
        </Container>
      </div>

      <Section tight>
        <Container>
          <div className="cart-layout">
            <div className="cart-panel">
              <div className="cart-panel__header">
                <h2 className="cart-panel__heading">Your bag ({itemCount})</h2>
              </div>

              <div className="cart-table__head" aria-hidden="true">
                <span />
                <span>Product</span>
                <span>Price</span>
                <span>Quantity</span>
                <span>Total</span>
              </div>

              <ul className="cart-lines">
                {lines.map((line) => {
                  const stock = getLineStock(line)
                  const atMaxStock = line.quantity >= stock
                  return (
                    <li key={line.lineId} className="cart-line">
                      <Link to={`/product/${line.slug}`} className="cart-line__image" aria-hidden="true">
                        {line.image ? (
                          <img src={line.image} alt="" loading="lazy" decoding="async" />
                        ) : (
                          <span className="cart-line__image-placeholder" />
                        )}
                      </Link>

                      <div className="cart-line__product">
                        <Link to={`/product/${line.slug}`} className="cart-line__name link-underline">
                          {line.name}
                        </Link>
                        <p className="cart-line__meta">
                          {line.productNumber} · SKU {line.sku}
                        </p>
                        <p className="cart-line__meta">Size {line.size}</p>
                        {atMaxStock && (
                          <p className="cart-line__stock-note">
                            <PackageIcon /> Only a few left in stock
                          </p>
                        )}
                        <button
                          type="button"
                          className="cart-line__remove-mobile"
                          aria-label={`Remove ${line.name}, size ${line.size} from bag`}
                          onClick={() => removeItem(line.lineId)}
                        >
                          <TrashIcon /> Remove
                        </button>
                      </div>

                      <span className="cart-line__price">{formatPrice(line.price)}</span>

                      <div className="cart-line__qty">
                        <div className="cart-line__stepper">
                          <button
                            type="button"
                            aria-label={`Decrease quantity of ${line.name}, size ${line.size}`}
                            onClick={() => updateQuantity(line.lineId, line.quantity - 1)}
                          >
                            −
                          </button>
                          <span aria-live="polite">{line.quantity}</span>
                          <button
                            type="button"
                            aria-label={`Increase quantity of ${line.name}, size ${line.size}`}
                            disabled={atMaxStock}
                            onClick={() => updateQuantity(line.lineId, line.quantity + 1)}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div className="cart-line__total-cell">
                        <span className="cart-line__total">{formatPrice(line.price * line.quantity)}</span>
                        <button
                          type="button"
                          className="cart-line__remove"
                          aria-label={`Remove ${line.name}, size ${line.size} from bag`}
                          onClick={() => removeItem(line.lineId)}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>

              <div className="cart-panel__actions">
                <Link to="/shop" className="cart-continue">
                  <ArrowLeftIcon /> Continue shopping
                </Link>
                <button type="button" className="cart-clear" onClick={clearCart}>
                  <TrashIcon /> Clear bag
                </button>
              </div>

              {related.length > 0 && (
                <div className="cart-related">
                  <div className="cart-related__header">
                    <h3 className="cart-related__heading">You might also like</h3>
                    <Link to="/shop" className="cart-related__see-all">
                      See all <ArrowRightIcon />
                    </Link>
                  </div>
                  <div className="shop-grid cart-related__grid">
                    {related.map((item, index) => (
                      <ProductCard key={item.id} product={item} index={index} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <aside className="cart-summary">
              <h2 className="cart-summary__heading">Order summary</h2>

              <div className="cart-summary__row">
                <span>Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <div className="cart-summary__row">
                <span className="cart-summary__label-icon">
                  Shipping <InfoIcon />
                </span>
                <span className="cart-summary__muted">Calculated at checkout</span>
              </div>

              <div className="cart-summary__divider" />

              <div className="cart-summary__row cart-summary__row--total">
                <span>Total</span>
                <span className="cart-summary__total-block">
                  {formatPrice(subtotal)}
                  <small>Inclusive of all taxes</small>
                </span>
              </div>

              <Button to="/checkout" variant="primary" block className="cart-summary__checkout">
                Proceed to checkout <ArrowRightIcon />
              </Button>

              <div className="cart-summary__payments">
                <p className="text-label">We accept</p>
                <ul className="cart-summary__payment-icons">
                  {PAYMENT_METHODS.map((method) => (
                    <li key={method}>{method}</li>
                  ))}
                </ul>
                <p className="cart-summary__secure">
                  <LockIcon /> 100% secure payments
                </p>
              </div>

              <p className="cart-summary__signature">A bigger you.</p>
            </aside>
          </div>

          <ul className="cart-trust-row">
            <li>
              <TruckIcon />
              <div>
                <strong>Free shipping</strong>
                <span>On orders above ₹999</span>
              </div>
            </li>
            <li>
              <ReturnIcon />
              <div>
                <strong>Easy returns</strong>
                <span>7-day hassle free returns</span>
              </div>
            </li>
            <li>
              <ShieldIcon />
              <div>
                <strong>Secure payments</strong>
                <span>Your data is always safe</span>
              </div>
            </li>
            <li>
              <HeadsetIcon />
              <div>
                <strong>Need help?</strong>
                <span>Chat with us anytime</span>
              </div>
            </li>
          </ul>
        </Container>
      </Section>
    </div>
  )
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3.5 5h11M7.5 5V3.5h3V5M7 8v5M11 8v5M4.5 5l.6 9a1 1 0 0 0 1 .9h5.8a1 1 0 0 0 1-.9l.6-9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ArrowLeftIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M13 8H3M7 4L3 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ArrowRightIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 7.2v4M8 5.2v.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="3.5" y="8" width="11" height="7.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.5 8V5.5a3.5 3.5 0 0 1 7 0V8" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

function PackageIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M2.5 5.5L9 2l6.5 3.5v7L9 16l-6.5-3.5v-7z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M2.5 5.5L9 9m0 0l6.5-3.5M9 9v7" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

function TruckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M1.5 5h11v10h-11z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M12.5 9h4l3 3.3V15h-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="5.5" cy="16.5" r="1.6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="16" cy="16.5" r="1.6" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

function ReturnIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M4 11a7 7 0 1 1 2.2 5.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M4 6.5V11h4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M11 2.5l7 2.6v5.4c0 4.6-3 7.6-7 9-4-1.4-7-4.4-7-9V5.1l7-2.6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M7.8 11l2.2 2.2 4.2-4.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function HeadsetIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M4 12v-1a7 7 0 0 1 14 0v1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <rect x="2.5" y="11.5" width="3.5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="16" y="11.5" width="3.5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <path d="M18 16.5v.5a3 3 0 0 1-3 3h-2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export default Cart
