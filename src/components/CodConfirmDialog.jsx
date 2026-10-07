import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatPrice } from '../lib/formatPrice.js'
import './CodConfirmDialog.css'

/**
 * "Please check everything" confirmation shown ONLY for Cash on Delivery,
 * right before the order is actually placed. It exists so the customer
 * understands exactly what pressing the final button does: the order is
 * placed immediately, nothing is paid online, and cash is handed over on
 * delivery.
 *
 * Desktop: centred dialog, details in two columns.
 * Mobile: bottom sheet with a pinned action bar (thumb-reachable).
 *
 * @param {{
 *   open: boolean,
 *   payload: object | null,        // result of buildOrderPayload()
 *   lines: Array<{lineId: string, name: string, size: string, quantity: number, price: number, image?: string}>,
 *   deliveryLabel: string,
 *   deliveryDetail: string,
 *   busy: boolean,
 *   error: string | null,
 *   onConfirm: () => void,
 *   onClose: () => void,
 * }} props
 */
function CodConfirmDialog({
  open,
  payload,
  lines,
  deliveryLabel,
  deliveryDetail,
  busy,
  error,
  onConfirm,
  onClose,
}) {
  const [agreed, setAgreed] = useState(false)
  const sheetRef = useRef(null)
  const lastFocusRef = useRef(null)

  // Fresh, unticked state each time it opens.
  useEffect(() => {
    if (open) setAgreed(false)
  }, [open])

  // Scroll lock, Esc to close, focus in / focus restore.
  useEffect(() => {
    if (!open) return undefined
    lastFocusRef.current = document.activeElement
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    sheetRef.current?.focus()

    function onKey(event) {
      if (event.key === 'Escape' && !busy) {
        onClose()
        return
      }
      if (event.key !== 'Tab' || !sheetRef.current) return
      const focusable = sheetRef.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
      lastFocusRef.current?.focus?.()
    }
  }, [open, busy, onClose])

  if (!open || !payload) return null

  const { customer, shippingAddress, totals } = payload
  const amount = formatPrice(totals.total)
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0)

  return createPortal(
    <div
      className="cod-modal"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div
        className="cod-modal__sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cod-title"
        aria-describedby="cod-lead"
        tabIndex={-1}
        ref={sheetRef}
      >
        <span className="cod-modal__grip" aria-hidden="true" />

        <div className="cod-modal__scroll">
          {/* ---- Header ---- */}
          <header className="cod-modal__header">
            <span className="cod-modal__badge" aria-hidden="true">
              <CashIcon />
            </span>
            <div>
              <p className="cod-modal__eyebrow">Cash on Delivery</p>
              <h2 id="cod-title" className="cod-modal__title">
                Please check everything before you confirm
              </h2>
            </div>
          </header>

          <p id="cod-lead" className="cod-modal__lead">
            When you tap <strong>Confirm &amp; place order</strong>, your order is placed
            right away. You pay nothing online. Just hand the cash to our delivery partner
            when your parcel arrives.
          </p>

          {/* ---- Amount to keep ready ---- */}
          <div className="cod-amount">
            <div>
              <span className="cod-amount__label">Keep this ready in cash</span>
              <span className="cod-amount__note">Inclusive of all taxes</span>
            </div>
            <strong className="cod-amount__value">{amount}</strong>
          </div>

          {/* ---- Details ---- */}
          <div className="cod-grid">
            <section className="cod-card" aria-label="Delivery address">
              <h3 className="cod-card__title">
                <PinIcon /> Delivering to
              </h3>
              <p className="cod-card__strong">
                {customer.firstName} {customer.lastName}
              </p>
              <p>{shippingAddress.addressLine1}</p>
              {shippingAddress.addressLine2 && <p>{shippingAddress.addressLine2}</p>}
              <p>
                {shippingAddress.city}, {shippingAddress.state} {shippingAddress.postalCode}
              </p>
              <p>{shippingAddress.country}</p>
              <p className="cod-card__phone">
                <PhoneIcon /> +91 {customer.phone.replace(/^\+?91[\s-]?/, '')}
              </p>
            </section>

            <section className="cod-card" aria-label="Order items">
              <h3 className="cod-card__title">
                <BagIcon /> Your order · {itemCount} {itemCount === 1 ? 'item' : 'items'}
              </h3>
              <ul className="cod-items">
                {lines.map((line) => (
                  <li key={line.lineId} className="cod-item">
                    <span className="cod-item__thumb">
                      {line.image ? <img src={line.image} alt="" loading="lazy" decoding="async" /> : null}
                    </span>
                    <span className="cod-item__info">
                      <b>{line.name}</b>
                      <small>
                        Size {line.size} · Qty {line.quantity}
                      </small>
                    </span>
                    <span className="cod-item__price">
                      {formatPrice(line.price * line.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
              <dl className="cod-totals">
                <div>
                  <dt>Subtotal</dt>
                  <dd>{formatPrice(totals.subtotal)}</dd>
                </div>
                <div>
                  <dt>{deliveryLabel}</dt>
                  <dd>{totals.shipping === 0 ? 'Free' : formatPrice(totals.shipping)}</dd>
                </div>
                <div className="cod-totals__grand">
                  <dt>To pay on delivery</dt>
                  <dd>{amount}</dd>
                </div>
              </dl>
              <p className="cod-card__eta">
                <TruckIcon /> {deliveryDetail}
              </p>
            </section>
          </div>

          {/* ---- Good to know ---- */}
          <section className="cod-know" aria-label="Good to know">
            <h3 className="cod-know__title">Good to know</h3>
            <ul>
              <li>
                <span aria-hidden="true">1</span>
                <p>
                  <b>Pay in cash on delivery.</b> Please keep the exact amount handy so the
                  handover is quick.
                </p>
              </li>
              <li>
                <span aria-hidden="true">2</span>
                <p>
                  <b>Keep your phone on.</b> The delivery partner may call the number above, so
                  please make sure it is correct.
                </p>
              </li>
              <li>
                <span aria-hidden="true">3</span>
                <p>
                  <b>Someone should be available</b> at the address to receive the parcel.
                </p>
              </li>
            </ul>
          </section>

          {/* ---- Agreement ---- */}
          <label className={`cod-agree${agreed ? ' is-checked' : ''}`}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              disabled={busy}
            />
            <span className="cod-agree__box" aria-hidden="true">
              <TickIcon />
            </span>
            <span className="cod-agree__text">
              I have checked my address and phone number, and I agree to pay <b>{amount}</b> in
              cash when my order is delivered.
            </span>
          </label>

          {error && (
            <p className="cod-error" role="alert">
              {error}
            </p>
          )}
        </div>

        {/* ---- Actions (pinned on mobile) ---- */}
        <footer className="cod-modal__actions">
          <button
            type="button"
            className="cod-btn cod-btn--primary"
            onClick={onConfirm}
            disabled={!agreed || busy}
          >
            {busy ? (
              <>
                <span className="cod-spinner" aria-hidden="true" /> Placing your order…
              </>
            ) : (
              <>
                <TickIcon /> Confirm &amp; place order
              </>
            )}
          </button>
          <button type="button" className="cod-btn cod-btn--ghost" onClick={onClose} disabled={busy}>
            Go back &amp; edit
          </button>
          {!agreed && !busy && (
            <p className="cod-actions__hint">Tick the box above to place your order.</p>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  )
}

/* ---- icons ---- */
const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

function CashIcon() {
  return (
    <svg {...svgProps}>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 9.5v.01M18 14.5v.01" />
    </svg>
  )
}
function PinIcon() {
  return (
    <svg {...svgProps}>
      <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  )
}
function PhoneIcon() {
  return (
    <svg {...svgProps}>
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
    </svg>
  )
}
function BagIcon() {
  return (
    <svg {...svgProps}>
      <path d="M6 7h12l1 13H5L6 7z" />
      <path d="M9 7a3 3 0 0 1 6 0" />
    </svg>
  )
}
function TruckIcon() {
  return (
    <svg {...svgProps}>
      <path d="M2 6h11v10H2zM13 10h4l3 3v3h-7" />
      <circle cx="7" cy="17.5" r="1.8" />
      <circle cx="17" cy="17.5" r="1.8" />
    </svg>
  )
}
function TickIcon() {
  return (
    <svg {...svgProps} strokeWidth={2.6}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

export default CodConfirmDialog
