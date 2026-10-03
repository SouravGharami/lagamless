import {
  REPLACEMENT_STATUS_LABELS,
  REPLACEMENT_STATUS_MESSAGES,
  REPLACEMENT_STEPS,
  describeReplacementChange,
  hasReplacementTracking,
} from '../lib/replacementStatus.js'
import { formatDate } from '../lib/formatDate.js'
// Same visual language as the return timeline — the classes are reused as-is
// (this file only imports the stylesheet; ReturnTimeline itself is untouched).
import './ReturnTimeline.css'
// Reuses the same tracking-block styling the order tracking card uses
// (.order-lookup-card__tracking) so a replacement's tracking looks identical
// to an order's — see src/pages/OrderLookup.css. Already loaded by every
// screen that renders this component (OrderHistory.jsx imports it), but
// imported here too so this component doesn't depend on that.
import '../pages/OrderLookup.css'
import ItemImage from './ItemImage.jsx'

/**
 * Customer-facing replacement status: a badge, a one-line explanation, what
 * was requested, and — for every status except `rejected` — a progress track
 * (Requested → Approved → Return received → Processing → Shipped →
 * Delivered). `rejected` is a dead end outside the forward flow (whether from
 * a plain Reject or a failed verification), so it renders as a standalone
 * badge with the reason. Once shipped, any tracking details the admin added
 * are shown the same way an order's own tracking is.
 *
 * @param {{
 *   replacement: {
 *     status: string, requestedSize: string, originalSize?: string | null,
 *     requestedColor?: string | null, requestedAt?: string, deliveredAt?: string | null,
 *     shippedAt?: string | null, rejectionReason?: string | null,
 *     trackingCourier?: string | null, trackingId?: string | null, trackingUrl?: string | null,
 *   },
 *   itemLabel?: string,   // product name — shown when an order has several items
 * }} props
 */
function ReplacementTimeline({ replacement, itemLabel, itemImage, itemName }) {
  if (!replacement?.status) return null
  const { status } = replacement
  const isRejected = status === 'rejected'
  const currentIndex = REPLACEMENT_STEPS.findIndex((step) => step.key === status)
  const isComplete = status === 'replacement_completed'
  // Once delivered, "Track package" has nothing left to show — same rule
  // OrderHistory.jsx already applies to a regular order's own tracking
  // block (order.status !== 'delivered').
  const showTracking = !isRejected && !isComplete && hasReplacementTracking(replacement)

  return (
    <div className="return-timeline" data-replacement-status={status}>
      <span
        className={
          'return-timeline__badge' +
          (isComplete ? ' return-timeline__badge--complete' : '') +
          (isRejected ? ' return-timeline__badge--rejected' : '')
        }
      >
        {REPLACEMENT_STATUS_LABELS[status] ?? status}
      </span>

      <p className="return-timeline__message text-small">{REPLACEMENT_STATUS_MESSAGES[status]}</p>

      {(itemImage || itemName) && (
        <ul className="return-timeline__items" aria-label="Item being replaced">
          <li className="return-timeline__item">
            <ItemImage src={itemImage} alt={itemName || ''} size="sm" />
            <span>
              {itemName}
            </span>
          </li>
        </ul>
      )}

      <p className="return-timeline__meta text-small" style={{ marginTop: 'var(--space-2)' }}>
        {itemLabel ? `${itemLabel} · ` : ''}
        {describeReplacementChange(replacement)}
        {replacement.requestedAt ? ` · Requested ${formatDate(replacement.requestedAt)}` : ''}
      </p>

      {isRejected && replacement.rejectionReason && (
        <p className="return-timeline__meta text-small" style={{ marginTop: 'var(--space-2)' }}>
          Reason: {replacement.rejectionReason}
        </p>
      )}

      {!isRejected && (
        <ol className="return-timeline__track" aria-label="Replacement progress">
          {REPLACEMENT_STEPS.map((step, index) => {
            const state =
              index < currentIndex || (index === currentIndex && isComplete)
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
      )}

      {showTracking && (
        <div className="order-lookup-card__tracking">
          <p className="text-small" style={{ color: 'var(--color-graphite)' }}>
            {replacement.shippedAt ? `Shipped ${formatDate(replacement.shippedAt)}` : 'Shipped'}
            {replacement.trackingCourier ? ` via ${replacement.trackingCourier}` : ''}
            {replacement.trackingId ? ` · Tracking ID ${replacement.trackingId}` : ''}
          </p>
          {replacement.trackingUrl && (
            <a
              href={replacement.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary order-lookup-card__track-btn"
            >
              Track package
            </a>
          )}
        </div>
      )}

      {isComplete && replacement.deliveredAt && (
        <p className="return-timeline__meta text-small">Delivered on {formatDate(replacement.deliveredAt)}</p>
      )}
    </div>
  )
}

export default ReplacementTimeline
