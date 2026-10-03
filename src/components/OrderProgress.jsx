import { formatDate } from '../lib/formatDate.js'
import { BagIcon, CheckIcon, TruckIcon, HomeIcon } from './TrackIcons.jsx'

const STEPS = ['Placed', 'Confirmed', 'Shipped', 'Delivered']
const STEP_ICONS = [BagIcon, CheckIcon, TruckIcon, HomeIcon]

// Which step each order status has reached (0-based index into STEPS).
const REACHED = { pending: 0, confirmed: 1, processing: 1, shipped: 2, delivered: 3 }

/** The one-line headline the customer reads first. */
function headline(order) {
  switch (order.status) {
    case 'pending':
      return order.paymentMethod === 'cod'
        ? "Order placed — we'll confirm it shortly"
        : 'Waiting for payment'
    case 'confirmed':
      return 'Your order is confirmed'
    case 'processing':
      return "We're packing your order"
    case 'shipped':
      return 'Your order is on its way'
    case 'delivered':
      return order.deliveredAt
        ? `Your order is delivered · ${formatDate(order.deliveredAt)}`
        : 'Your order is delivered'
    default:
      return null
  }
}

/**
 * Compact Placed → Confirmed → Shipped → Delivered tracker for the customer's
 * order card. Cancelled / payment-failed orders don't get one (they never
 * complete the journey) — the status badge already says what happened.
 */
function OrderProgress({ order }) {
  const reached = REACHED[order.status]
  if (reached === undefined) return null
  const text = headline(order)

  return (
    <div className="order-progress">
      {text && (
        <p
          className={'order-progress__headline' + (order.status === 'delivered' ? ' order-progress__headline--done' : '')}
        >
          {text}
        </p>
      )}
      <ol className="order-progress__track" aria-label="Order progress">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={
              'order-progress__step' +
              (i <= reached ? ' order-progress__step--done' : '') +
              (i === reached ? ' order-progress__step--current' : '')
            }
            aria-current={i === reached ? 'step' : undefined}
          >
            <span className="order-progress__dot" aria-hidden="true">
              {(() => {
                const Icon = STEP_ICONS[i]
                return <Icon width={15} height={15} />
              })()}
            </span>
            <span className="order-progress__label">{label}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export default OrderProgress
