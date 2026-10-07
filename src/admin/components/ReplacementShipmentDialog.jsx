import { useEffect, useRef, useState } from 'react'

/**
 * Shown when an admin clicks "Ship replacement" on a `replacement_processing`
 * request. Same three tracking fields as the order Shipment dialog
 * (ShipmentDialog.jsx / orders.tracking_courier|tracking_id|tracking_url),
 * but — unlike that one — every field here is optional and none is
 * required to submit: the spec asks to "store replacement shipment/tracking
 * details if available", not to require them before the status can move.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {{ id: string, orderId: string, customerName?: string, customerEmail?: string, trackingCourier?: string | null, trackingId?: string | null, trackingUrl?: string | null } | null} props.target
 * @param {(details: { trackingCourier: string, trackingId: string, trackingUrl: string }) => void} props.onConfirm
 * @param {() => void} props.onCancel
 * @param {boolean} [props.saving]
 */
function ReplacementShipmentDialog({ open, target, onConfirm, onCancel, saving = false }) {
  const [courier, setCourier] = useState('')
  const [trackingId, setTrackingId] = useState('')
  const [trackingUrl, setTrackingUrl] = useState('')
  const [touched, setTouched] = useState(false)
  const firstFieldRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setCourier(target?.trackingCourier || '')
    setTrackingId(target?.trackingId || '')
    setTrackingUrl(target?.trackingUrl || '')
    setTouched(false)
    firstFieldRef.current?.focus()
  }, [open, target])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(event) {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onCancel])

  if (!open || !target) return null

  const urlError = trackingUrl.trim() && !/^https?:\/\//i.test(trackingUrl.trim())
  const canSubmit = !urlError

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
        aria-labelledby="replacement-shipment-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="replacement-shipment-dialog-title" className="text-h3">
          Ship this replacement
        </h2>
        <p className="text-small admin-dialog__description">
          Order #{target.orderId.slice(0, 8).toUpperCase()}
          {target.customerName || target.customerEmail ? ` (${target.customerName || target.customerEmail})` : ''}.
          Tracking details are optional — add them if you have them, or ship without and add them later.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="admin-field">
            <label className="text-label" htmlFor="replacement-shipment-courier">
              Delivery partner
            </label>
            <input
              id="replacement-shipment-courier"
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
            <label className="text-label" htmlFor="replacement-shipment-tracking-id">
              Tracking / AWB id
            </label>
            <input
              id="replacement-shipment-tracking-id"
              className="input"
              type="text"
              placeholder="e.g. 1234567890"
              value={trackingId}
              onChange={(e) => setTrackingId(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="admin-field">
            <label className="text-label" htmlFor="replacement-shipment-tracking-url">
              Tracking link
            </label>
            <input
              id="replacement-shipment-tracking-url"
              className="input"
              type="text"
              placeholder="https://www.delhivery.com/track/package/1234567890"
              value={trackingUrl}
              onChange={(e) => setTrackingUrl(e.target.value)}
              autoComplete="off"
              aria-invalid={Boolean(touched && urlError)}
              aria-describedby={touched && urlError ? 'replacement-shipment-tracking-url-error' : undefined}
            />
            {touched && urlError && (
              <p id="replacement-shipment-tracking-url-error" className="admin-field__error" role="alert">
                Tracking link should start with http:// or https://
              </p>
            )}
          </div>

          <div className="admin-dialog__actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Shipping…' : 'Mark as shipped'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ReplacementShipmentDialog
