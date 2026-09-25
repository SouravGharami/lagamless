import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Container from '../components/Container.jsx'
import Section from '../components/Section.jsx'
import Button from '../components/Button.jsx'
import { getOrderStatus } from '../services/checkout.js'
import './OrderStatus.css'

function FailedGlyph() {
  return (
    <svg className="order-status__glyph" viewBox="0 0 84 84" fill="none" aria-hidden="true">
      <circle className="order-status__glyph-circle" cx="42" cy="42" r="35" />
      <path className="order-status__glyph-mark" d="M31 31l22 22M53 31L31 53" />
    </svg>
  )
}

function OrderFailed() {
  const { orderId } = useParams()
  const [order, setOrder] = useState(null)

  useEffect(() => {
    let cancelled = false
    getOrderStatus(orderId)
      .then((data) => {
        if (!cancelled) setOrder(data)
      })
      .catch(() => {
        // Non-critical here — the page reads fine without the summary.
      })
    return () => {
      cancelled = true
    }
  }, [orderId])

  const wentThroughAnyway = order?.status === 'confirmed'

  return (
    <div className="order-status order-status--failed">
      <Section>
        <Container>
          <div className="order-status__inner">
            <p className="order-status__eyebrow">Payment not completed</p>

            <FailedGlyph />

            <h1 className="order-status__headline">Your payment didn't go through.</h1>

            <p className="order-status__id">Order #{orderId}</p>

            <p className="order-status__sub">
              {wentThroughAnyway
                ? 'Good news — this order actually did go through since you landed here; no need to pay again.'
                : "Nothing was charged. Your cart is untouched, so you can try paying again, or come back to it later."}
            </p>

            <div className="order-status__ticket">
              <div className="order-status__ticket-section">
                <p className="order-status__ticket-label">Why this can happen</p>
                <ol className="order-status__steps">
                  <li className="order-status__step">
                    <span className="order-status__step-num">1</span>
                    <span>The payment window was closed before it finished.</span>
                  </li>
                  <li className="order-status__step">
                    <span className="order-status__step-num">2</span>
                    <span>Your bank or card declined the transaction.</span>
                  </li>
                  <li className="order-status__step">
                    <span className="order-status__step-num">3</span>
                    <span>A network hiccup interrupted the connection.</span>
                  </li>
                </ol>
              </div>
            </div>

            <div className="order-status__actions">
              {!wentThroughAnyway && (
                <Button to="/checkout" variant="primary">
                  Try payment again
                </Button>
              )}
              <Button to="/cart" variant="secondary">
                Review your bag
              </Button>
            </div>
          </div>
        </Container>
      </Section>
    </div>
  )
}

export default OrderFailed
