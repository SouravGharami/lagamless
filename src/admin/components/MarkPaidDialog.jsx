import { useEffect, useState } from 'react'
import { COLLECTION_METHODS } from '../../services/adminOrders.js'
import { formatPrice } from '../../lib/formatPrice.js'

/**
 * Records that the money for a Cash-on-Delivery order has reached the store.
 *
 * Two modes:
 *  - "pay"     — opened from the row's "Mark paid" button. Just records payment.
 *  - "deliver" — opened when the admin picks "Delivered" on an UNPAID COD order.
 *                Delivery and payment are separate facts (a courier can deliver
 *                today and remit the cash next week), so it asks instead of
 *                assuming: "Delivered & paid" or "Delivered, payment pending".
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {'pay' | 'deliver'} props.mode
 * @param {{ id: string, customerName?: string, total: number | null, subtotal: number } | null} props.order
 * @param {boolean} [props.saving]
 * @param {(details: { method: string, reference: string }) => void} props.onConfirm - mark paid (and deliver, in deliver mode)
 * @param {() => void} [props.onDeliverOnly] - deliver mode only: deliver but leave unpaid
 * @param {() => void} props.onCancel
 */
function MarkPaidDialog({ open, order, ...rest }) {
  if (!open || !order) return null
  // Keyed by order + mode so the form always starts fresh (Cash, no reference)
  // each time the dialog opens, without resetting state inside an effect.
  return <MarkPaidDialogBody key={`${order.id}:${rest.mode}`} order={order} {...rest} />
}

function MarkPaidDialogBody({ mode = 'pay', order, saving = false, onConfirm, onDeliverOnly, onCancel }) {
  const [method, setMethod] = useState('cash')
  const [reference, setReference] = useState('')
  const open = true

  useEffect(() => {
    if (!open) return
    function handleKeyDown(event) {
      if (event.key === 'Escape' && !saving) onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, saving, onCancel])

  const amount = formatPrice(order.total ?? order.subtotal)
  const shortId = order.id.slice(0, 8).toUpperCase()
  const isDeliver = mode === 'deliver'

  function handleSubmit(event) {
    event.preventDefault()
    if (saving) return
    onConfirm({ method, reference: reference.trim() })
  }

  return (
    <div className="admin-dialog__backdrop" onClick={saving ? undefined : onCancel}>
      <div
        className="admin-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="markpaid-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="markpaid-dialog-title" className="text-h3">
          {isDeliver ? 'Mark as delivered' : `Payment received — ${amount}`}
        </h2>
        <p className="text-small admin-dialog__description">
          {isDeliver
            ? `Order #${shortId}${order.customerName ? ` (${order.customerName})` : ''} is Cash on Delivery. Have you received the ${amount}?`
            : `Confirm you have received ${amount} for order #${shortId}${
                order.customerName ? ` from ${order.customerName}` : ''
              }. The customer will see their payment as received.`}
        </p>

        <form onSubmit={handleSubmit}>
          <div className="admin-field">
            <span className="text-label" id="markpaid-method-label">
              How did it arrive?
            </span>
            <div className="admin-filter-row" role="group" aria-labelledby="markpaid-method-label">
              {COLLECTION_METHODS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  className={'admin-filter-chip' + (method === m.key ? ' admin-filter-chip--active' : '')}
                  aria-pressed={method === m.key}
                  onClick={() => setMethod(m.key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="admin-field">
            <label className="text-label" htmlFor="markpaid-reference">
              Reference (optional)
            </label>
            <input
              id="markpaid-reference"
              className="input"
              type="text"
              placeholder={method === 'upi' ? 'UPI transaction id' : 'e.g. courier remittance no.'}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              autoComplete="off"
              maxLength={80}
            />
          </div>

          <div className="admin-dialog__actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
            {isDeliver && (
              <button type="button" className="btn btn-secondary" onClick={onDeliverOnly} disabled={saving}>
                Delivered, payment pending
              </button>
            )}
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : isDeliver ? 'Delivered & paid' : 'Mark as paid'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default MarkPaidDialog
