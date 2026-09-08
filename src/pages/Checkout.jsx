import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Container from '../components/Container.jsx'
import Section from '../components/Section.jsx'
import Button from '../components/Button.jsx'
import { useCart } from '../context/CartContext.jsx'
import { formatPrice } from '../lib/formatPrice.js'
import {
  buildCheckoutPayload,
  getEmptyCheckoutForm,
  validateCheckoutForm,
} from '../lib/checkoutValidation.js'
import './Checkout.css'

const SESSION_KEY = 'lagamless.checkout.form.v1'
const COUNTRIES = ['India']

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

function Checkout() {
  const { lines, subtotal } = useCart()
  const [form, setForm] = useState(readSavedForm)
  const [touched, setTouched] = useState({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [step, setStep] = useState('form') // 'form' | 'reviewing'
  const [payload, setPayload] = useState(null)

  // Persist form input (never payment info — there isn't any yet) so a
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

  function handleSubmit(event) {
    event.preventDefault()
    setSubmitAttempted(true)
    if (!valid || lines.length === 0) return

    const totals = { subtotal, shipping: null, discount: 0, total: null }
    setPayload(buildCheckoutPayload(form, lines, totals))
    setStep('reviewing')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (lines.length === 0) {
    return (
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
    )
  }

  return (
    <Section>
      <Container>
        <p className="text-label">Checkout</p>
        <h1 className="text-h1" style={{ marginTop: '1rem' }}>
          Checkout
        </h1>

        <div className="checkout-layout">
          <div className="checkout-form-column">
            {step === 'reviewing' ? (
              <ReviewPanel payload={payload} onEdit={() => setStep('form')} />
            ) : (
              <form className="checkout-form" onSubmit={handleSubmit} noValidate>
                <fieldset className="checkout-fieldset">
                  <legend className="text-h3">Customer information</legend>
                  <div className="checkout-form-row">
                    <Field
                      label="First name"
                      id="firstName"
                      autoComplete="given-name"
                      value={form.firstName}
                      onChange={handleChange('firstName')}
                      onBlur={handleBlur('firstName')}
                      error={showError('firstName')}
                    />
                    <Field
                      label="Last name"
                      id="lastName"
                      autoComplete="family-name"
                      value={form.lastName}
                      onChange={handleChange('lastName')}
                      onBlur={handleBlur('lastName')}
                      error={showError('lastName')}
                    />
                  </div>
                  <Field
                    label="Email"
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={handleChange('email')}
                    onBlur={handleBlur('email')}
                    error={showError('email')}
                  />
                  <Field
                    label="Phone number"
                    id="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="98765 43210"
                    value={form.phone}
                    onChange={handleChange('phone')}
                    onBlur={handleBlur('phone')}
                    error={showError('phone')}
                  />
                </fieldset>

                <fieldset className="checkout-fieldset">
                  <legend className="text-h3">Delivery address</legend>
                  <Field
                    label="Address line 1"
                    id="addressLine1"
                    autoComplete="address-line1"
                    value={form.addressLine1}
                    onChange={handleChange('addressLine1')}
                    onBlur={handleBlur('addressLine1')}
                    error={showError('addressLine1')}
                  />
                  <Field
                    label="Address line 2 (optional)"
                    id="addressLine2"
                    autoComplete="address-line2"
                    required={false}
                    value={form.addressLine2}
                    onChange={handleChange('addressLine2')}
                    onBlur={handleBlur('addressLine2')}
                  />
                  <div className="checkout-form-row">
                    <Field
                      label="City"
                      id="city"
                      autoComplete="address-level2"
                      value={form.city}
                      onChange={handleChange('city')}
                      onBlur={handleBlur('city')}
                      error={showError('city')}
                    />
                    <Field
                      label="State"
                      id="state"
                      autoComplete="address-level1"
                      value={form.state}
                      onChange={handleChange('state')}
                      onBlur={handleBlur('state')}
                      error={showError('state')}
                    />
                  </div>
                  <div className="checkout-form-row">
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
                    <div className="checkout-field">
                      <label className="text-label" htmlFor="country">
                        Country
                      </label>
                      <select
                        id="country"
                        className="input"
                        autoComplete="country-name"
                        value={form.country}
                        onChange={handleChange('country')}
                      >
                        {COUNTRIES.map((country) => (
                          <option key={country} value={country}>
                            {country}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </fieldset>

                <fieldset className="checkout-fieldset">
                  <legend className="text-h3">Delivery</legend>
                  <p className="text-small checkout-placeholder-note">
                    Shipping charges will be calculated after the delivery address is confirmed.
                    Real-time courier rates will connect here in a later part.
                  </p>
                </fieldset>

                <fieldset className="checkout-fieldset">
                  <legend className="text-h3">Payment</legend>
                  <p className="text-small checkout-placeholder-note">
                    Payment will be processed securely once a payment provider is connected —
                    UPI, cards, and net banking are all planned. No payment details are collected
                    on this screen.
                  </p>
                  <div className="checkout-payment-methods" aria-hidden="true">
                    <span className="tag">UPI</span>
                    <span className="tag">Card</span>
                    <span className="tag">Net banking</span>
                  </div>
                </fieldset>

                {submitAttempted && !valid && (
                  <p className="text-small checkout-form-error" role="alert">
                    Please fix the highlighted fields before continuing.
                  </p>
                )}

                <Button type="submit" variant="primary" block>
                  Continue to payment
                </Button>
              </form>
            )}
          </div>

          <OrderSummary lines={lines} subtotal={subtotal} />
        </div>
      </Container>
    </Section>
  )
}

/**
 * @param {{
 *   label: string, id: string, value: string,
 *   onChange: (e: any) => void, onBlur: () => void,
 *   error?: string|false, type?: string, autoComplete?: string,
 *   placeholder?: string, inputMode?: string, maxLength?: number,
 *   required?: boolean,
 * }} props
 */
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
      <label className="text-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        name={id}
        className="input"
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

function OrderSummary({ lines, subtotal }) {
  return (
    <aside className="checkout-summary" aria-label="Order summary">
      <div className="checkout-summary__header">
        <span className="text-label">Order summary</span>
        <Link to="/cart" className="checkout-summary__edit link-underline">
          Edit bag
        </Link>
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
              <span className="checkout-summary__qty" aria-hidden="true">
                {line.quantity}
              </span>
            </div>
            <div className="checkout-summary__info">
              <span className="text-small checkout-summary__name">{line.name}</span>
              <span className="text-small checkout-summary__meta">
                {line.productNumber} · Size {line.size} · Qty {line.quantity}
              </span>
            </div>
            <span className="text-small checkout-summary__total">
              {formatPrice(line.price * line.quantity)}
            </span>
          </li>
        ))}
      </ul>

      <div className="checkout-summary__totals">
        <div className="checkout-summary__row">
          <span>Subtotal</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
        <div className="checkout-summary__row">
          <span>Shipping</span>
          <span>To be calculated</span>
        </div>
        <div className="checkout-summary__row checkout-summary__row--total">
          <span className="text-h3">Total</span>
          <span className="text-h3">To be calculated</span>
        </div>
      </div>
    </aside>
  )
}

function ReviewPanel({ payload, onEdit }) {
  if (!payload) return null
  const { customer, shippingAddress } = payload

  return (
    <div className="checkout-review">
      <p className="text-label">Details saved</p>
      <h2 className="text-h2" style={{ marginTop: '0.75rem' }}>
        Payment is coming soon.
      </h2>
      <p className="text-lead" style={{ marginTop: '1rem', maxWidth: '52ch' }}>
        Your information below is ready to go. Payment processing will be connected in a later
        part of this build — nothing has been charged, and no order has been placed yet.
      </p>

      <div className="checkout-review__block">
        <p className="text-label">Customer</p>
        <p className="text-small">
          {customer.firstName} {customer.lastName}
        </p>
        <p className="text-small">{customer.email}</p>
        <p className="text-small">{customer.phone}</p>
      </div>

      <div className="checkout-review__block">
        <p className="text-label">Delivery address</p>
        <p className="text-small">{shippingAddress.addressLine1}</p>
        {shippingAddress.addressLine2 && <p className="text-small">{shippingAddress.addressLine2}</p>}
        <p className="text-small">
          {shippingAddress.city}, {shippingAddress.state} {shippingAddress.postalCode}
        </p>
        <p className="text-small">{shippingAddress.country}</p>
      </div>

      <Button variant="secondary" onClick={onEdit} style={{ marginTop: '1.5rem' }}>
        Edit information
      </Button>
    </div>
  )
}

export default Checkout
