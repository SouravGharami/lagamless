import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Container from '../components/Container.jsx'
import Section from '../components/Section.jsx'
import Button from '../components/Button.jsx'
import { useCart } from '../context/CartContext.jsx'
import { formatPrice } from '../lib/formatPrice.js'
import { payWithRazorpay, placeCodOrder } from '../services/checkout.js'
import {
  buildCheckoutPayload,
  getEmptyCheckoutForm,
  validateCheckoutForm,
} from '../lib/checkoutValidation.js'
import './Checkout.css'

const SESSION_KEY = 'lagamless.checkout.form.v1'
const COUNTRIES = ['India']

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
]

// Shipping is presentation-only for now: the `create-razorpay-order` edge
// function prices the order from the cart items alone, so the express fee
// below is NOT yet added to the amount actually charged. Add it server-side
// before switching express on for real customers.
const DELIVERY_OPTIONS = [
  { id: 'standard', label: 'Standard Delivery', detail: '3–6 business days', fee: 0 },
  { id: 'express', label: 'Express Delivery', detail: '1–3 business days', fee: 99 },
]

const PAYMENT_TABS = [
  { id: 'upi', label: 'UPI' },
  { id: 'card', label: 'Card' },
  { id: 'netbanking', label: 'Net Banking' },
  { id: 'cod', label: 'COD' },
]

const PAYMENT_COPY = {
  upi: {
    brands: ['GPay', 'PhonePe', 'Paytm', 'BHIM'],
    note: 'You will be redirected to your UPI app to complete the payment.',
  },
  card: {
    brands: ['Visa', 'Mastercard', 'RuPay', 'Amex'],
    note: 'Credit and debit cards are processed securely by Razorpay. Card details are never stored on our servers.',
  },
  netbanking: {
    brands: ['HDFC', 'ICICI', 'SBI', 'Axis'],
    note: 'Choose your bank on the next screen to complete the transfer.',
  },
  cod: {
    brands: [],
    note: 'Pay in cash when your order is delivered.',
  },
}

/** Reads a previously-entered (non-sensitive) checkout form from sessionStorage. */
function readSavedForm() {
  if (typeof window === 'undefined') return getEmptyCheckoutForm()
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY)
    if (!raw) return getEmptyCheckoutForm()
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return getEmptyCheckoutForm()
    return { ...getEmptyCheckoutForm(), ...parsed }
  } catch {
    return getEmptyCheckoutForm()
  }
}

/** One id per checkout attempt — lets the server treat a retry/double-click as the same order. */
function newIdempotencyKey() {
  try {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  } catch {
    // fall through to the non-crypto fallback below
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

function Checkout() {
  const { lines, subtotal, clearCart } = useCart()
  const navigate = useNavigate()
  const [form, setForm] = useState(readSavedForm)
  const [touched, setTouched] = useState({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [step, setStep] = useState('form') // 'form' | 'reviewing'
  const [payload, setPayload] = useState(null)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState(null)
  const [deliveryMethod, setDeliveryMethod] = useState('standard')
  const [paymentMethod, setPaymentMethod] = useState('upi')
  // Stays the same across retries of ONE checkout attempt (see placeCod below).
  const idempotencyKeyRef = useRef(null)

  // Persist form input (never payment info — there isn't any here) so a
  // refresh doesn't force the customer to retype everything. Cart data is
  // untouched by this — it lives entirely in CartContext/localStorage.
  useEffect(() => {
    try {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(form))
    } catch {
      // sessionStorage can fail (private browsing, quota) — the form still
      // works for the current page view, it just won't survive a refresh.
    }
  }, [form])

  const { valid, errors } = useMemo(() => validateCheckoutForm(form), [form])

  const shipping = DELIVERY_OPTIONS.find((option) => option.id === deliveryMethod)?.fee ?? 0
  const total = subtotal + shipping
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0)

  function handleChange(field) {
    return (event) => {
      const { value } = event.target
      setForm((prev) => ({ ...prev, [field]: value }))
    }
  }

  function handleBlur(field) {
    return () => setTouched((prev) => ({ ...prev, [field]: true }))
  }

  function showError(field) {
    return (touched[field] || submitAttempted) && errors[field]
  }

  function buildOrderPayload() {
    const totals = { subtotal, shipping, discount: 0, total }
    return {
      ...buildCheckoutPayload(form, lines, totals),
      deliveryMethod,
      paymentMethod,
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    setSubmitAttempted(true)
    if (!valid || lines.length === 0 || paying) return

    const orderPayload = buildOrderPayload()

    // Cash on Delivery: there's nothing to pay online, so there's no "review
    // and pay" step — the button on this form IS the confirmation.
    if (paymentMethod === 'cod') {
      placeCod(orderPayload)
      return
    }

    setPayload(orderPayload)
    setStep('reviewing')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /**
   * Places a Cash on Delivery order. The same idempotency key is reused if the
   * customer retries after an error, so a request that actually reached the
   * server but whose response got lost can never create a second order.
   */
  async function placeCod(orderPayload) {
    if (paying) return
    setPayError(null)
    setPaying(true)
    try {
      if (!idempotencyKeyRef.current) idempotencyKeyRef.current = newIdempotencyKey()
      const { orderId, amount } = await placeCodOrder(orderPayload, idempotencyKeyRef.current)

      // Snapshot what the customer just ordered BEFORE the cart is cleared, so
      // the success page shows the product details immediately (and still does
      // if its follow-up order lookup is slow or fails). The server stays the
      // source of truth for prices — OrderSuccess prefers its data once loaded.
      const orderSummary = {
        items: lines.map((line) => ({
          product_name: line.name,
          size: line.size,
          quantity: line.quantity,
          line_total: line.price * line.quantity,
          image: line.image || null,
        })),
        shippingAddress: orderPayload.shippingAddress,
        customerName: `${orderPayload.customer.firstName} ${orderPayload.customer.lastName}`.trim(),
      }
      clearCart()
      window.sessionStorage.removeItem(SESSION_KEY)
      navigate(`/order/success/${orderId}`, {
        state: { fromCheckout: true, paymentMethod: 'cod', amount, orderSummary },
      })
    } catch (err) {
      setPayError(err.message || 'We could not place your order. Please try again.')
    } finally {
      setPaying(false)
    }
  }

  async function handlePay() {
    if (!payload || paying) return
    setPayError(null)
    setPaying(true)
    try {
      const { outcome, orderId } = await payWithRazorpay(payload)
      if (outcome === 'paid') {
        clearCart()
        window.sessionStorage.removeItem(SESSION_KEY)
        navigate(`/order/success/${orderId}`, { state: { fromCheckout: true } })
      } else {
        // Payment failed or the customer closed the Razorpay modal. The
        // cart and form stay exactly as they were so "Try payment again"
        // on the Failed page can re-run checkout without retyping anything.
        navigate(`/order/failed/${orderId}`, { state: { fromCheckout: true } })
      }
    } catch (err) {
      setPayError(err.message || 'Something went wrong starting payment. Please try again.')
    } finally {
      setPaying(false)
    }
  }

  if (lines.length === 0) {
    return (
      <div className="checkout-page">
        <Section>
          <Container>
            <p className="text-label">Checkout</p>
            <h1 className="text-h1" style={{ marginTop: '1rem' }}>
              Your bag is empty.
            </h1>
            <p className="text-lead" style={{ marginTop: '1.5rem', maxWidth: '52ch' }}>
              There's nothing to check out yet. Browse the collection and add something first.
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
    <div className="checkout-page">
      <CheckoutHero />

      <div className="checkout-shell">
        <div className="checkout-grid">
          <div className="checkout-main">
            {step === 'reviewing' ? (
              <ReviewPanel
                payload={payload}
                onEdit={() => setStep('form')}
                onPay={handlePay}
                paying={paying}
                payError={payError}
              />
            ) : (
              <form className="checkout-card checkout-form" onSubmit={handleSubmit} noValidate>
                {/* ---- 1. Contact ---- */}
                <section className="checkout-step">
                  <StepHeader
                    number={1}
                    title="Contact Information"
                    subtitle="We'll use this to keep you updated on your order."
                    aside={
                      <span className="checkout-step__aside">
                        Already have an account?{' '}
                        <Link to="/login" className="checkout-link">
                          Login
                        </Link>
                      </span>
                    }
                  />

                  <div className="checkout-row checkout-row--2">
                    <Field
                      label="First name"
                      id="firstName"
                      placeholder="Sourav"
                      autoComplete="given-name"
                      value={form.firstName}
                      onChange={handleChange('firstName')}
                      onBlur={handleBlur('firstName')}
                      error={showError('firstName')}
                    />
                    <Field
                      label="Last name"
                      id="lastName"
                      placeholder="Gharami"
                      autoComplete="family-name"
                      value={form.lastName}
                      onChange={handleChange('lastName')}
                      onBlur={handleBlur('lastName')}
                      error={showError('lastName')}
                    />
                  </div>

                  <div className="checkout-row checkout-row--2">
                    <Field
                      label="Email address"
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      autoComplete="email"
                      value={form.email}
                      onChange={handleChange('email')}
                      onBlur={handleBlur('email')}
                      error={showError('email')}
                    />
                    <div className="checkout-field">
                      <label className="checkout-label" htmlFor="phone">
                        Phone number <span className="checkout-req">*</span>
                      </label>
                      <div
                        className={`checkout-phone${showError('phone') ? ' checkout-phone--error' : ''}`}
                      >
                        <span className="checkout-phone__prefix" aria-hidden="true">
                          <IndiaFlag />
                          +91
                        </span>
                        <input
                          id="phone"
                          name="phone"
                          className="checkout-input checkout-input--bare"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          placeholder="98765 43210"
                          value={form.phone}
                          onChange={handleChange('phone')}
                          onBlur={handleBlur('phone')}
                          required
                          aria-invalid={Boolean(showError('phone'))}
                          aria-describedby={showError('phone') ? 'phone-error' : undefined}
                        />
                      </div>
                      {showError('phone') && (
                        <p id="phone-error" className="checkout-field__error" role="alert">
                          {errors.phone}
                        </p>
                      )}
                    </div>
                  </div>
                </section>

                {/* ---- 2. Address ---- */}
                <section className="checkout-step">
                  <StepHeader
                    number={2}
                    title="Delivery Address"
                    subtitle="Where should we deliver your order?"
                  />

                  <Field
                    label="Address line 1"
                    id="addressLine1"
                    placeholder="House no, Building, Street name"
                    autoComplete="address-line1"
                    value={form.addressLine1}
                    onChange={handleChange('addressLine1')}
                    onBlur={handleBlur('addressLine1')}
                    error={showError('addressLine1')}
                  />
                  <Field
                    label="Address line 2 (optional)"
                    id="addressLine2"
                    placeholder="Apartment, Landmark, etc."
                    autoComplete="address-line2"
                    required={false}
                    value={form.addressLine2}
                    onChange={handleChange('addressLine2')}
                    onBlur={handleBlur('addressLine2')}
                  />

                  <div className="checkout-row checkout-row--3">
                    <Field
                      label="City"
                      id="city"
                      placeholder="Kolkata"
                      autoComplete="address-level2"
                      value={form.city}
                      onChange={handleChange('city')}
                      onBlur={handleBlur('city')}
                      error={showError('city')}
                    />
                    <SelectField
                      label="State"
                      id="state"
                      autoComplete="address-level1"
                      placeholder="Select state"
                      options={INDIAN_STATES}
                      value={form.state}
                      onChange={handleChange('state')}
                      onBlur={handleBlur('state')}
                      error={showError('state')}
                    />
                    <Field
                      label="PIN code"
                      id="postalCode"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      placeholder="700001"
                      maxLength={6}
                      value={form.postalCode}
                      onChange={handleChange('postalCode')}
                      onBlur={handleBlur('postalCode')}
                      error={showError('postalCode')}
                    />
                  </div>

                  <div className="checkout-row checkout-row--half">
                    <SelectField
                      label="Country"
                      id="country"
                      autoComplete="country-name"
                      options={COUNTRIES}
                      value={form.country}
                      onChange={handleChange('country')}
                    />
                  </div>
                </section>

                {/* ---- 3. Delivery method ---- */}
                <section className="checkout-step">
                  <StepHeader
                    number={3}
                    title="Delivery Method"
                    subtitle="Choose your preferred shipping option."
                  />

                  <div className="checkout-options" role="radiogroup" aria-label="Delivery method">
                    {DELIVERY_OPTIONS.map((option) => (
                      <label
                        key={option.id}
                        className={`checkout-option${deliveryMethod === option.id ? ' is-selected' : ''}`}
                      >
                        <span className="checkout-option__icon" aria-hidden="true">
                          {option.id === 'express' ? <IconBolt /> : <IconTruck />}
                        </span>
                        <span className="checkout-option__body">
                          <span className="checkout-option__label">{option.label}</span>
                          <span className="checkout-option__detail">{option.detail}</span>
                        </span>
                        <span className="checkout-option__price">
                          {option.fee === 0 ? 'Free' : formatPrice(option.fee)}
                        </span>
                        <input
                          type="radio"
                          name="deliveryMethod"
                          value={option.id}
                          checked={deliveryMethod === option.id}
                          onChange={() => setDeliveryMethod(option.id)}
                          className="checkout-option__input"
                        />
                        <span className="checkout-radio" aria-hidden="true" />
                      </label>
                    ))}
                  </div>
                </section>

                {/* ---- 4. Payment ---- */}
                <section className="checkout-step">
                  <StepHeader
                    number={4}
                    title="Payment Method"
                    subtitle="All transactions are secure and encrypted."
                  />

                  <div className="checkout-tabs" role="tablist" aria-label="Payment method">
                    {PAYMENT_TABS.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={paymentMethod === tab.id}
                        className={`checkout-tab${paymentMethod === tab.id ? ' is-active' : ''}`}
                        onClick={() => {
                          setPaymentMethod(tab.id)
                          setPayError(null)
                        }}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="checkout-paypanel">
                    <div className="checkout-paypanel__brands">
                      {PAYMENT_COPY[paymentMethod].brands.map((brand) => (
                        <span key={brand} className="checkout-brand">
                          {brand}
                        </span>
                      ))}
                      <span className="checkout-radio checkout-radio--static is-on" aria-hidden="true" />
                    </div>
                    <p className="checkout-paypanel__note">
                      {paymentMethod === 'cod'
                        ? `Pay ${formatPrice(total)} in cash when your order is delivered. Please keep the exact amount ready.`
                        : PAYMENT_COPY[paymentMethod].note}
                    </p>
                  </div>
                </section>

                {submitAttempted && !valid && (
                  <p className="checkout-form-error" role="alert">
                    Please fix the highlighted fields before continuing.
                  </p>
                )}

                {payError && (
                  <p className="checkout-form-error" role="alert">
                    {payError}
                  </p>
                )}

                <button type="submit" className="checkout-cta" disabled={paying}>
                  <IconLock />
                  {paymentMethod === 'cod'
                    ? paying
                      ? 'Placing your order…'
                      : 'Place your order'
                    : 'Continue to payment'}
                  <IconArrowRight />
                </button>

                <p className="checkout-secureline">
                  <IconLock />
                  100% Secure Payments <span aria-hidden="true">|</span> Your data is safe with us.
                </p>
              </form>
            )}
          </div>

          <aside className="checkout-side">
            <OrderSummary
              lines={lines}
              itemCount={itemCount}
              subtotal={subtotal}
              shipping={shipping}
              total={total}
            />
            <TrustCard />
            <PromoCard />
          </aside>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------- */
/* Hero                                                                    */
/* ---------------------------------------------------------------------- */

const HERO_WORDS = ['Clothes', 'People', 'Culture', 'Beyond', 'Limits']

function CheckoutHero() {
  return (
    <div className="checkout-hero">
      <div className="checkout-hero__media">
        <img
          src="/images/checkout-hero-banner.webp"
          alt="Checkout — almost yours. Good choices hit different."
          width="2048"
          height="768"
          loading="eager"
          decoding="async"
          fetchPriority="high"
        />
      </div>
      <h1 className="visually-hidden">Checkout</h1>
      <ul className="visually-hidden">
        {HERO_WORDS.map((word) => (
          <li key={word}>{word}</li>
        ))}
      </ul>
    </div>
  )
}

/* ---------------------------------------------------------------------- */
/* Form pieces                                                             */
/* ---------------------------------------------------------------------- */

function StepHeader({ number, title, subtitle, aside }) {
  return (
    <div className="checkout-step__header">
      <span className="checkout-step__number" aria-hidden="true">
        {number}
      </span>
      <div className="checkout-step__titles">
        <h2 className="checkout-step__title">{title}</h2>
        <p className="checkout-step__subtitle">{subtitle}</p>
      </div>
      {aside}
    </div>
  )
}

function Field({
  label,
  id,
  value,
  onChange,
  onBlur,
  error,
  type = 'text',
  autoComplete,
  placeholder,
  inputMode,
  maxLength,
  required = true,
}) {
  const errorId = `${id}-error`
  return (
    <div className="checkout-field">
      <label className="checkout-label" htmlFor={id}>
        {label} {required && <span className="checkout-req">*</span>}
      </label>
      <input
        id={id}
        name={id}
        className="checkout-input"
        type={type}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        autoComplete={autoComplete}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        required={required}
        aria-required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <p id={errorId} className="checkout-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function SelectField({
  label,
  id,
  value,
  onChange,
  onBlur,
  error,
  options,
  placeholder,
  autoComplete,
}) {
  const errorId = `${id}-error`
  return (
    <div className="checkout-field">
      <label className="checkout-label" htmlFor={id}>
        {label} <span className="checkout-req">*</span>
      </label>
      <div className="checkout-select">
        <select
          id={id}
          name={id}
          className="checkout-input"
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <span className="checkout-select__chevron" aria-hidden="true">
          <IconChevron />
        </span>
      </div>
      {error && (
        <p id={errorId} className="checkout-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------------- */
/* Sidebar                                                                 */
/* ---------------------------------------------------------------------- */

function OrderSummary({ lines, itemCount, subtotal, shipping, total }) {
  const [codeOpen, setCodeOpen] = useState(false)
  const [code, setCode] = useState('')
  const [codeNote, setCodeNote] = useState(null)

  return (
    <section className="checkout-card checkout-summary" aria-label="Order summary">
      <div className="checkout-summary__header">
        <h2 className="checkout-summary__heading">Order Summary</h2>
        <span className="checkout-summary__count">
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </span>
      </div>

      <ul className="checkout-summary__lines">
        {lines.map((line) => (
          <li key={line.lineId} className="checkout-summary__line">
            <div className="checkout-summary__image">
              {line.image ? (
                <img src={line.image} alt="" />
              ) : (
                <span className="checkout-summary__image-placeholder" />
              )}
            </div>
            <div className="checkout-summary__info">
              <span className="checkout-summary__name">{line.name}</span>
              <span className="checkout-summary__meta">{line.productNumber}</span>
              <span className="checkout-summary__meta">
                Size: {line.size} <span aria-hidden="true">·</span> Qty: {line.quantity}
              </span>
            </div>
            <span className="checkout-summary__price">
              {formatPrice(line.price * line.quantity)}
            </span>
          </li>
        ))}
      </ul>

      <div className="checkout-discount">
        <button
          type="button"
          className="checkout-discount__toggle"
          aria-expanded={codeOpen}
          onClick={() => setCodeOpen((open) => !open)}
        >
          <IconTag />
          <span>Have a discount code?</span>
          <span className={`checkout-discount__chevron${codeOpen ? ' is-open' : ''}`}>
            <IconChevron />
          </span>
        </button>
        {codeOpen && (
          <div className="checkout-discount__body">
            <input
              className="checkout-input"
              placeholder="Enter code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              aria-label="Discount code"
            />
            <button
              type="button"
              className="checkout-discount__apply"
              onClick={() => setCodeNote('Discount codes are not live yet — coming soon.')}
            >
              Apply
            </button>
            {codeNote && <p className="checkout-discount__note">{codeNote}</p>}
          </div>
        )}
      </div>

      <div className="checkout-summary__totals">
        <div className="checkout-summary__row">
          <span>Subtotal</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
        <div className="checkout-summary__row">
          <span>Shipping</span>
          <span>{shipping === 0 ? 'Free' : formatPrice(shipping)}</span>
        </div>
      </div>

      <div className="checkout-summary__grand">
        <span className="checkout-summary__grand-label">Total</span>
        <span className="checkout-summary__grand-value">
          {formatPrice(total)}
          <span className="checkout-summary__tax">Inclusive of all taxes</span>
        </span>
      </div>
    </section>
  )
}

const TRUST_ITEMS = [
  { icon: <IconTruck />, title: 'Free Shipping', detail: 'On orders above ₹999' },
  { icon: <IconReturn />, title: 'Easy Returns', detail: '7-day hassle free returns' },
  { icon: <IconShield />, title: 'Secure Payments', detail: 'Your data is always safe' },
  { icon: <IconHelp />, title: 'Need Help?', detail: 'Chat with us anytime' },
]

function TrustCard() {
  return (
    <section className="checkout-card checkout-trust" aria-label="Why shop with us">
      {TRUST_ITEMS.map((item) => (
        <div key={item.title} className="checkout-trust__item">
          <span className="checkout-trust__icon" aria-hidden="true">
            {item.icon}
          </span>
          <div>
            <p className="checkout-trust__title">{item.title}</p>
            <p className="checkout-trust__detail">{item.detail}</p>
          </div>
        </div>
      ))}
    </section>
  )
}

function PromoCard() {
  return (
    <section className="checkout-card checkout-promo">
      <img
        src="/images/checkout-promo-banner.webp"
        alt="LAGAMLESS shopping bag. More than clothing. A culture. Different people, same culture."
        width="1536"
        height="1024"
        loading="lazy"
        decoding="async"
      />
    </section>
  )
}

/* ---------------------------------------------------------------------- */
/* Review step                                                             */
/* ---------------------------------------------------------------------- */

function ReviewPanel({ payload, onEdit, onPay, paying, payError }) {
  if (!payload) return null
  const { customer, shippingAddress, totals } = payload

  return (
    <div className="checkout-card checkout-review">
      <p className="checkout-hero__eyebrow">Details saved</p>
      <h2 className="checkout-review__title">Ready to pay</h2>
      <p className="checkout-review__lead">
        Your information below is ready to go. You'll pay securely via Razorpay — UPI, cards, and
        net banking are all supported. Nothing is charged until you complete payment in the next
        step.
      </p>

      <div className="checkout-review__grid">
        <div className="checkout-review__block">
          <p className="checkout-label">Customer</p>
          <p>
            {customer.firstName} {customer.lastName}
          </p>
          <p>{customer.email}</p>
          <p>{customer.phone}</p>
        </div>

        <div className="checkout-review__block">
          <p className="checkout-label">Delivery address</p>
          <p>{shippingAddress.addressLine1}</p>
          {shippingAddress.addressLine2 && <p>{shippingAddress.addressLine2}</p>}
          <p>
            {shippingAddress.city}, {shippingAddress.state} {shippingAddress.postalCode}
          </p>
          <p>{shippingAddress.country}</p>
        </div>
      </div>

      <div className="checkout-review__total">
        <span>Amount payable</span>
        <span>{formatPrice(totals?.total ?? 0)}</span>
      </div>

      {payError && (
        <p className="checkout-form-error" role="alert">
          {payError}
        </p>
      )}

      <div className="checkout-review__actions">
        <button type="button" className="checkout-cta" onClick={onPay} disabled={paying}>
          <IconLock />
          {paying ? 'Opening payment…' : 'Pay now'}
          <IconArrowRight />
        </button>
        <button type="button" className="checkout-ghost" onClick={onEdit} disabled={paying}>
          Edit information
        </button>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------- */
/* Icons — inline so the page ships no extra dependency                    */
/* ---------------------------------------------------------------------- */

function IconTruck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M3 7h11v9H3z" strokeLinejoin="round" />
      <path d="M14 10h4l3 3v3h-7z" strokeLinejoin="round" />
      <circle cx="7" cy="18" r="1.8" />
      <circle cx="17" cy="18" r="1.8" />
    </svg>
  )
}

function IconBolt() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M13 2 4 14h6l-1 8 9-12h-6z" strokeLinejoin="round" />
    </svg>
  )
}

function IconReturn() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7" strokeLinecap="round" />
      <path d="M3 4v5h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M12 3l7 3v5.5c0 4.3-2.9 8-7 9.5-4.1-1.5-7-5.2-7-9.5V6z" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconHelp() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-3.3-6.9L21 4l-1 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .9-1 1.7" strokeLinecap="round" />
      <circle cx="12" cy="17" r=".8" fill="currentColor" stroke="none" />
    </svg>
  )
}

function IconLock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="10" rx="1.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" strokeLinecap="round" />
    </svg>
  )
}

function IconArrowRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M4 12h16m-6-6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconChevron() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconTag() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M3 12.5V4h8.5L21 13.5 13.5 21z" strokeLinejoin="round" />
      <circle cx="7.5" cy="7.5" r="1.2" />
    </svg>
  )
}

function IndiaFlag() {
  return (
    <svg viewBox="0 0 18 12" className="checkout-flag" aria-hidden="true">
      <rect width="18" height="4" fill="#FF9933" />
      <rect y="4" width="18" height="4" fill="#ffffff" />
      <rect y="8" width="18" height="4" fill="#138808" />
      <circle cx="9" cy="6" r="1.4" fill="none" stroke="#000080" strokeWidth="0.5" />
    </svg>
  )
}

export default Checkout
