import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import Container from '../components/Container.jsx'
import Section from '../components/Section.jsx'
import Button from '../components/Button.jsx'
import { formatPrice } from '../lib/formatPrice.js'
import { getOrderStatus } from '../services/checkout.js'
import { downloadReceipt } from '../lib/generateReceipt.js'
import './OrderStatus.css'

function StatusGlyph({ variant }) {
  const isCod = variant === 'cod'
  return (
    <svg className="order-status__glyph" viewBox="0 0 84 84" fill="none" aria-hidden="true">
      <circle className="order-status__glyph-circle" cx="42" cy="42" r="35" />
      {isCod ? (
        <path
          className="order-status__glyph-mark"
          d="M42 26v32M50 33.5c0-3.6-3.6-6.5-8-6.5s-8 2.9-8 6.5 3.6 6.5 8 6.5 8 2.9 8 6.5-3.6 6.5-8 6.5-8-2.9-8-6.5"
        />
      ) : (
        <path className="order-status__glyph-mark" d="M27 43l11 11 19-22" />
      )}
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 3v9m0 0l-4-4m4 4l4-4M4 14v1.5A1.5 1.5 0 005.5 17h9a1.5 1.5 0 001.5-1.5V14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function OrderSuccess() {
  const { orderId } = useParams()
  const location = useLocation()
  const [order, setOrder] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    getOrderStatus(orderId)
      .then((data) => {
        if (!cancelled) setOrder(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [orderId])

  // COD is known from the order itself (get-order-status) or, if that hasn't
  // loaded / failed, from the router state Checkout passes along. Razorpay
  // orders never set either, so their page below is unchanged.
  const isCod = order?.paymentMethod === 'cod' || location.state?.paymentMethod === 'cod'

  // Checkout hands over a snapshot of what the customer just ordered so this
  // page has product details on first paint and even if the lookup fails.
  // Once the server's copy arrives it wins (it holds the authoritative prices);
  // the snapshot is only used to add product thumbnails and as the fallback.
  const snapshot = location.state?.orderSummary ?? null
  const imageByItem = new Map(
    (snapshot?.items ?? []).map((item) => [`${item.product_name}__${item.size}`, item.image]),
  )
  const items = (order?.items ?? snapshot?.items ?? []).map((item) => ({
    ...item,
    image: item.image ?? imageByItem.get(`${item.product_name}__${item.size}`) ?? null,
  }))
  const address = order?.shippingAddress ?? snapshot?.shippingAddress ?? null
  const total = order?.total ?? (isCod ? location.state?.amount : null) ?? null
  const subtotal =
    order?.subtotal ?? items.reduce((sum, item) => sum + Number(item.line_total || 0), 0)
  const shippingTotal =
    order?.shippingTotal ?? (isCod && total != null ? Math.max(0, total - subtotal) : 0)
  const discountTotal = order?.discountTotal ?? 0
  const firstName = snapshot?.customerName?.split(' ')[0] || order?.customerName?.split(' ')[0]

  const canDownload = items.length > 0 && (total != null || order?.total != null)

  const handleDownload = () => {
    downloadReceipt({
      orderId,
      paymentMethod: isCod ? 'cod' : order?.paymentMethod ?? 'razorpay',
      items,
      subtotal,
      shippingTotal,
      discountTotal,
      total: total ?? order?.total ?? 0,
      shippingAddress: address,
      customerName: snapshot?.customerName || order?.customerName,
      createdAt: order?.createdAt,
      paidAt: order?.paidAt,
    })
  }

  return (
    <div className={`order-status ${isCod ? 'order-status--cod' : ''}`}>
      <Section>
        <Container>
          <div className="order-status__inner">
            <p className="order-status__eyebrow">{isCod ? 'Cash on Delivery' : 'Order Confirmed'}</p>

            <StatusGlyph variant={isCod ? 'cod' : 'paid'} />

            <h1 className="order-status__headline">
              {isCod
                ? 'Your order has been placed successfully.'
                : 'Thank you — your payment went through.'}
            </h1>

            <p className="order-status__sub">
              {isCod
                ? `${firstName ? `Thank you, ${firstName}. ` : 'Thank you. '}${
                    total != null
                      ? `Please keep ${formatPrice(total)} ready — you'll pay in cash when your order is delivered.`
                      : "You'll pay in cash when your order is delivered."
                  }`
                : "We've got it from here. Your order is confirmed and on its way to being packed."}
            </p>

            <p className="order-status__id">Order #{orderId}</p>

            {error && (
              <p className="order-status__error-note">
                {isCod
                  ? `We couldn't load the full order summary right now (${error}). Hold onto your order number above — it's on file either way.`
                  : `Your payment was confirmed, but we couldn't load the full order summary right now (${error}). Hold onto your order number above — it's on file either way.`}
              </p>
            )}

            {(items.length > 0 || address) && (
              <div className="order-status__ticket">
                {items.length > 0 && (
                  <>
                    <div className="order-status__ticket-section">
                      <p className="order-status__ticket-label">Your items</p>
                      <ul className="order-status__lines">
                        {items.map((item, i) => (
                          <li key={i} className="order-status__line order-status__line--product">
                            {item.image && (
                              <img className="order-status__thumb" src={item.image} alt="" />
                            )}
                            <span className="order-status__line-info">
                              {item.product_name}
                              <span className="order-status__line-meta">
                                Size {item.size} · Qty {item.quantity}
                              </span>
                            </span>
                            <span className="order-status__line-price">
                              {formatPrice(item.line_total)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="order-status__perforation" />

                    <div className="order-status__ticket-section">
                      <div className="order-status__totals">
                        <div className="order-status__row">
                          <span>Subtotal</span>
                          <span>{formatPrice(subtotal)}</span>
                        </div>
                        {discountTotal > 0 && (
                          <div className="order-status__row">
                            <span>Discount</span>
                            <span>−{formatPrice(discountTotal)}</span>
                          </div>
                        )}
                        <div className="order-status__row">
                          <span>Shipping</span>
                          <span>{shippingTotal === 0 ? 'Free' : formatPrice(shippingTotal)}</span>
                        </div>
                        <div className="order-status__row order-status__row--total">
                          <span>{isCod ? 'Total to pay on delivery' : 'Total paid'}</span>
                          <span>{total != null ? formatPrice(total) : '—'}</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {address && (
                  <>
                    <div className="order-status__perforation" />
                    <div className="order-status__ticket-section">
                      <p className="order-status__ticket-label">Delivering to</p>
                      <p className="order-status__address">
                        {address.addressLine1}
                        {address.addressLine2 && (
                          <>
                            <br />
                            {address.addressLine2}
                          </>
                        )}
                        <br />
                        {address.city}, {address.state} {address.postalCode}
                        <br />
                        {address.country}
                      </p>
                    </div>
                  </>
                )}

                {isCod && (
                  <>
                    <div className="order-status__perforation" />
                    <div className="order-status__ticket-section">
                      <p className="order-status__ticket-label">What happens next</p>
                      <ol className="order-status__steps">
                        <li className="order-status__step">
                          <span className="order-status__step-num">1</span>
                          <span>We confirm your order — keep your phone handy in case we need to reach you.</span>
                        </li>
                        <li className="order-status__step">
                          <span className="order-status__step-num">2</span>
                          <span>We pack and ship it. Track it any time under "Track your order".</span>
                        </li>
                        <li className="order-status__step">
                          <span className="order-status__step-num">3</span>
                          <span>
                            Pay {total != null ? formatPrice(total) : 'the order total'} in cash to the
                            delivery partner on arrival.
                          </span>
                        </li>
                      </ol>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="order-status__actions">
              {canDownload && (
                <Button variant="secondary" onClick={handleDownload} className="order-status__download">
                  <DownloadIcon />
                  Download receipt
                </Button>
              )}
              <Button to="/shop" variant="primary">
                Continue shopping
              </Button>
              {isCod && (
                <Button to="/login" variant="secondary">
                  Track your order
                </Button>
              )}
            </div>
          </div>
        </Container>
      </Section>
    </div>
  )
}

export default OrderSuccess
