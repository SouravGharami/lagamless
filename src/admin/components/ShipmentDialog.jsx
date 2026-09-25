import { useEffect, useRef, useState } from 'react'

/**
 * Shown when an admin moves an order to "Shipped" from the row dropdown
 * or the quick-action button. Collects the delivery partner's name, the
 * tracking/AWB id, and a link to the courier's tracking page — all three
 * optional individually, but at least one is required, so an order never
 * silently flips to "Shipped" with nothing for the customer to track.
 *
 * On confirm, the parent is responsible for saving the status ('shipped')
 * together with these three fields in a single update (see
 * updateOrderStatus in services/adminOrders.js) so the customer-facing
 * "Track your order" page (OrderLookup.jsx) can show them right away.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {{ id: string, customerName?: string, customerEmail?: string, trackingCourier?: string, trackingId?: string, trackingUrl?: string } | null} props.order
 * @param {(details: { trackingCourier: string, trackingId: string, trackingUrl: string }) => void} props.onConfirm
 * @param {() => void} props.onCancel
 * @param {boolean} [props.saving]
 */
function ShipmentDialog({ open, order, onConfirm, onCancel, saving = false }) {
  const [courier, setCourier] = useState('')
  const [trackingId, setTrackingId] = useState('')
  const [trackingUrl, setTrackingUrl] = useState('')
  const [touched, setTouched] = useState(false)
  const firstFieldRef = useRef(null)

  // Reset/prefill whenever a different order is opened (or re-opened to
  // edit already-saved tracking details).
  useEffect(() => {
    if (!open) return
    setCourier(order?.trackingCourier || '')
    setTrackingId(order?.trackingId || '')
    setTrackingUrl(order?.trackingUrl || '')
    setTouched(false)
    firstFieldRef.current?.focus()
  }, [open, order])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(event) {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onCancel])

  if (!open || !order) return null

  const urlError = trackingUrl.trim() && !/^https?:\/\//i.test(trackingUrl.trim())
  const missingEverything = !courier.trim() && !trackingId.trim() && !trackingUrl.trim()
  const canSubmit = !missingEverything && !urlError

  function handleSubmit(event) {
    event.preventDefault()
    setTouched(true)
    if (!canSubmit || saving) return
    onConfirm({
      trackingCourier: courier.trim(),
      trackingId: trackingId.trim(),
      trackingUrl: trackingUrl.trim(),
    })
  }

  return (
    <div className="admin-dialog__backdrop" onClick={saving ? undefined : onCancel}>
      <div
        className="admin-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shipment-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="shipment-dialog-title" className="text-h3">
          Mark as shipped
        </h2>
        <p className="text-small admin-dialog__description">
          Add the delivery partner's tracking link and/or id for order #{order.id.slice(0, 8).toUpperCase()}
          {order.customerName ? ` (${order.customerName})` : ''}. This is what the customer will see when they
          track their order.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="admin-field">
            <label className="text-label" htmlFor="shipment-courier">
              Delivery partner
            </label>
            <input
              id="shipment-courier"
              ref={firstFieldRef}
              className="input"
              type="text"
              placeholder="e.g. Delhivery, Blue Dart, India Post"
              value={courier}
              onChange={(e) => setCourier(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="admin-field">
            <label className="text-label" htmlFor="shipment-tracking-id">
              Tracking / AWB id
            </label>
            <input
              id="shipment-tracking-id"
              className="input"
              type="text"
              placeholder="e.g. 1234567890"
              value={trackingId}
              onChange={(e) => setTrackingId(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="admin-field">
            <label className="text-label" htmlFor="shipment-tracking-url">
              Tracking link
            </label>
            <input
              id="shipment-tracking-url"
              className="input"
              type="text"
              placeholder="https://www.delhivery.com/track/package/1234567890"
              value={trackingUrl}
              onChange={(e) => setTrackingUrl(e.target.value)}
              autoComplete="off"
              aria-invalid={Boolean(touched && urlError)}
              aria-describedby={touched && urlError ? 'shipment-tracking-url-error' : undefined}
            />
            {touched && urlError && (
              <p id="shipment-tracking-url-error" className="admin-field__error" role="alert">
                Tracking link should start with http:// or https://
              </p>
            )}
          </div>

          {touched && missingEverything && (
            <p className="admin-field__error" role="alert">
              Add at least a courier, tracking id, or tracking link so the customer has something to go on.
            </p>
          )}

          <div className="admin-dialog__actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Mark as shipped'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ShipmentDialog
