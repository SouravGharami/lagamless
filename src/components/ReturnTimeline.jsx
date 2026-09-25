import { formatPrice } from '../lib/formatPrice.js'
import './ReturnTimeline.css'
import ItemImage from './ItemImage.jsx'

/**
 * Customer-facing label for every `returns.status` value (see
 * supabase/part-17-returns-table.sql onward and
 * src/admin/components/StatusBadge.jsx for the admin-side equivalents).
 * Exported so other screens (e.g. a future per-item mini badge) can reuse
 * the exact same wording instead of re-deriving it.
 */
export const RETURN_STATUS_LABELS = {
  requested: 'Return Request Initiated',
  approved: 'Return Approved',
  pickup: 'Return Pickup Scheduled',
  received: 'Product Received',
  inspection: 'Product Under Inspection',
  refund_pending: 'Refund Being Processed',
  refunded: 'Refund Completed',
  rejected: 'Return Request Rejected',
}

/**
 * The customer-facing sentence shown under the status badge/timeline for
 * every `returns.status` value. `refunded`'s wording is fixed by product
 * copy; the rest describe what that stage means so the timeline doesn't
 * stand alone without context.
 */
export const RETURN_STATUS_MESSAGES = {
  requested: "We've received your return request and it's being reviewed.",
  approved: "Your return has been approved. We'll schedule a pickup shortly.",
  pickup: 'A pickup has been scheduled for your returned item.',
  received: "We've received your returned product at our warehouse.",
  inspection: 'Your returned product is currently under inspection.',
  refund_pending: 'Inspection passed — your refund is now being processed.',
  refunded: 'Your refund has been successfully processed. Thank you for shopping with LAGAMLESS.',
  rejected: "Your return request wasn't approved. Contact us if you have questions.",
}

/**
 * The six forward-moving stages the timeline draws. `refund_pending` and
 * `refunded` both land on the final "Refund" step — one mid-flight, one
 * complete — since the customer-facing timeline collapses the admin's two
 * refund sub-states into a single visual step.
 */
const STEPS = [
  { key: 'requested', label: 'Requested' },
  { key: 'approved', label: 'Approved' },
  { key: 'pickup', label: 'Pickup' },
  { key: 'received', label: 'Received' },
  { key: 'inspection', label: 'Inspection' },
  { key: 'refund', label: 'Refund' },
]

const STEP_INDEX = {
  requested: 0,
  approved: 1,
  pickup: 2,
  received: 3,
  inspection: 4,
  refund_pending: 5,
  refunded: 5,
}

/**
 * Renders the current returns.status as a badge plus, for every status
 * except `rejected`, a six-step progress track showing how far the
 * return has moved. `rejected` is a dead-end outside the normal forward
 * flow (it can be reached from `requested` or from `inspection`), so it
 * renders as a standalone badge rather than a partially-filled track.
 *
 * @param {{ status: string | null, refundAmount?: number | null, refundedAt?: string | null }} props
 */
function ReturnTimeline({ status, refundAmount, refundedAt, items }) {
  if (!status) return null

  if (status === 'rejected') {
    return (
      <div className="return-timeline">
        <span className="return-timeline__badge return-timeline__badge--rejected">
          {RETURN_STATUS_LABELS.rejected}
        </span>
        <p className="return-timeline__message text-small">{RETURN_STATUS_MESSAGES.rejected}</p>

      {items?.length > 0 && (
        <ul className="return-timeline__items" aria-label="Items in this return">
          {items.map((item, i) => (
            <li key={item.id ?? i} className="return-timeline__item">
              <ItemImage src={item.imageUrl} alt={item.product_name} size="sm" />
              <span>
                {item.product_name}
                <small>
                  Size {item.size} · Qty {item.quantity}
                </small>
              </span>
            </li>
          ))}
        </ul>
      )}
      </div>
    )
  }

  const currentIndex = STEP_INDEX[status] ?? 0
  const isComplete = status === 'refunded'

  return (
    <div className="return-timeline">
      <span className={'return-timeline__badge' + (isComplete ? ' return-timeline__badge--complete' : '')}>
        {RETURN_STATUS_LABELS[status] ?? status}
      </span>

      <p className="return-timeline__message text-small">{RETURN_STATUS_MESSAGES[status]}</p>

      {items?.length > 0 && (
        <ul className="return-timeline__items" aria-label="Items in this return">
          {items.map((item, i) => (
            <li key={item.id ?? i} className="return-timeline__item">
              <ItemImage src={item.imageUrl} alt={item.product_name} size="sm" />
              <span>
                {item.product_name}
                <small>
                  Size {item.size} · Qty {item.quantity}
                </small>
              </span>
            </li>
          ))}
        </ul>
      )}

      <ol className="return-timeline__track" aria-label="Return progress">
        {STEPS.map((step, index) => {
          const state = index < currentIndex || (index === currentIndex && isComplete)
            ? 'done'
            : index === currentIndex
              ? 'current'
              : 'upcoming'
          return (
            <li
              key={step.key}
              className={`return-timeline__step return-timeline__step--${state}`}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span className="return-timeline__dot" aria-hidden="true" />
              <span className="return-timeline__label">{step.label}</span>
            </li>
          )
        })}
      </ol>

      {isComplete && (refundAmount != null || refundedAt) && (
        <p className="return-timeline__meta text-small">
          {refundAmount != null ? `Amount refunded: ${formatPrice(refundAmount)}` : ''}
          {refundAmount != null && refundedAt ? ' · ' : ''}
          {refundedAt
            ? `Refunded on ${new Date(refundedAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}`
            : ''}
        </p>
      )}
    </div>
  )
}

export default ReturnTimeline
