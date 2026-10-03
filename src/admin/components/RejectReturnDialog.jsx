import { useEffect, useRef, useState } from 'react'

/**
 * Shown when an admin clicks "Reject" on a return request, or "Inspection
 * Failed" once a return is being inspected (src/admin/pages/
 * AdminReturns.jsx). Unlike the plain ConfirmDialog used for order
 * cancellation, this one requires a reason before it can be submitted —
 * the reason is saved to `returns.rejection_reason` (see
 * supabase/part-20-returns-rejection-reason.sql) alongside `status =
 * 'rejected'` in the same update. That column has always meant "why this
 * return was rejected" regardless of which stage the rejection happened
 * at (rejectReturn() for a 'requested' return, failInspection() for one
 * in 'inspection' — see supabase/part-22-returns-inspection.sql and
 * src/services/adminReturns.js), so this one dialog is reused for both
 * call sites via the text props below rather than duplicated.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {{ id: string, orderId: string, customerName?: string, customerEmail?: string } | null} props.returnRequest
 * @param {(reason: string) => void} props.onConfirm
 * @param {() => void} props.onCancel
 * @param {boolean} [props.saving]
 * @param {string} [props.title]
 * @param {string} [props.descriptionSuffix] - sentence appended after the order/customer identifier
 * @param {string} [props.fieldLabel]
 * @param {string} [props.placeholder]
 * @param {string} [props.fieldErrorMessage]
 * @param {string} [props.cancelLabel]
 * @param {string} [props.confirmLabel]
 * @param {string} [props.savingLabel]
 * @param {string} [props.confirmClassName] - confirm button class; defaults to the destructive style
 */
function RejectReturnDialog({
  open,
  returnRequest,
  onConfirm,
  onCancel,
  saving = false,
  title = 'Reject this return request?',
  descriptionSuffix = "A reason is required — it's saved with the return and shown here once rejected.",
  fieldLabel = 'Rejection reason',
  placeholder = 'e.g. Item shows signs of wear beyond normal use',
  fieldErrorMessage = 'Enter a reason so the rejection can be recorded.',
  cancelLabel = 'Keep as requested',
  confirmLabel = 'Reject return',
  savingLabel = 'Rejecting…',
  confirmClassName = 'btn admin-btn-danger',
}) {
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const fieldRef = useRef(null)

  // Reset whenever a different return is opened.
  useEffect(() => {
    if (!open) return
    setReason('')
    setTouched(false)
    fieldRef.current?.focus()
  }, [open, returnRequest])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(event) {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onCancel])

  if (!open || !returnRequest) return null

  const trimmed = reason.trim()
  const missingReason = !trimmed
  const canSubmit = !missingReason

  function handleSubmit(event) {
    event.preventDefault()
    setTouched(true)
    if (!canSubmit || saving) return
    onConfirm(trimmed)
  }

  return (
    <div className="admin-dialog__backdrop" onClick={saving ? undefined : onCancel}>
      <div
        className="admin-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reject-return-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="reject-return-dialog-title" className="text-h3">
          {title}
        </h2>
        <p className="text-small admin-dialog__description">
          Order #{returnRequest.orderId.slice(0, 8).toUpperCase()}
          {returnRequest.customerName || returnRequest.customerEmail
            ? ` (${returnRequest.customerName || returnRequest.customerEmail})`
            : ''}
          . {descriptionSuffix}
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="admin-field">
            <label className="text-label" htmlFor="reject-return-reason">
              {fieldLabel}
            </label>
            <textarea
              id="reject-return-reason"
              ref={fieldRef}
              className="input admin-form__textarea"
              rows={3}
              placeholder={placeholder}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-invalid={Boolean(touched && missingReason)}
              aria-describedby={touched && missingReason ? 'reject-return-reason-error' : undefined}
            />
            {touched && missingReason && (
              <p id="reject-return-reason-error" className="admin-field__error" role="alert">
                {fieldErrorMessage}
              </p>
            )}
          </div>

          <div className="admin-dialog__actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
              {cancelLabel}
            </button>
            <button type="submit" className={confirmClassName} disabled={saving}>
              {saving ? savingLabel : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default RejectReturnDialog
