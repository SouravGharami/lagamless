import { useEffect, useRef, useState } from 'react'
import Button from './Button.jsx'
import { submitReturnRequest } from '../services/returns.js'
import './ReturnRequestDialog.css'
import { ReturnIcon, CheckIcon } from './TrackIcons.jsx'
import ItemImage from './ItemImage.jsx'

/** Fixed reason list per spec — order matters, shown as-is in the dropdown. */
export const RETURN_REASONS = [
  "Size doesn't fit",
  'Wrong product received',
  'Damaged product',
  'Defective product',
  'Different from description',
  'Other',
]

/**
 * Return-request form opened from a delivered order's "Return" button on
 * OrderLookup (see src/pages/OrderLookup.jsx).
 *
 * Submits to `public.returns` via the `submit-return-request` edge
 * function (see src/services/returns.js), which re-validates ownership,
 * delivery status/date, the 7-day return window, and duplicate requests
 * server-side — this form's own checks are just for a responsive UI, not
 * the source of truth.
 *
 * @param {{
 *   open: boolean,
 *   order: {
 *     orderId: string,
 *     items?: Array<{ id?: string, product_name: string, size: string, quantity: number }>,
 *   } | null,
 *   customerEmail: string,
 *   onClose: () => void,
 *   onSubmitted?: () => void,
 * }} props
 */
function ReturnRequestDialog({ open, order, customerEmail, onClose, onSubmitted }) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [itemId, setItemId] = useState('')
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const reasonRef = useRef(null)

  const items = order?.items ?? []
  // Items that already have a requested return aren't offered again —
  // the backend would reject a duplicate anyway (see
  // submit-return-request), but filtering here keeps the picker honest.
  const returnableItems = items.filter((item) => !item.returnRequested)
  // Only ask which item when there's a real choice to make — a single
  // returnable item has an unambiguous order_item_id, so no picker is
  // shown and it's used automatically (see the effect below).
  const needsItemPicker = returnableItems.length > 1

  // Fresh form every time the dialog opens (including reopening for a
  // different order), so nothing from a previous attempt leaks in.
  useEffect(() => {
    if (open) {
      setReason('')
      setNote('')
      setItemId(returnableItems.length === 1 ? returnableItems[0]?.id ?? '' : '')
      setSubmitAttempted(false)
      setSubmitting(false)
      setSubmitError(null)
      setSubmitted(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order?.orderId])

  useEffect(() => {
    if (!open) return undefined

    function onKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    reasonRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open || !order) return null

  const reasonError = submitAttempted && !reason ? 'Select a reason for your return.' : null
  const itemError = submitAttempted && needsItemPicker && !itemId ? 'Select which item this return is for.' : null

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitAttempted(true)
    setSubmitError(null)
    if (!reason || (needsItemPicker && !itemId) || submitting) return

    setSubmitting(true)
    try {
      await submitReturnRequest({
        orderId: order.orderId,
        email: customerEmail,
        reason,
        note,
        orderItemId: itemId || null,
      })
      setSubmitted(true)
      // Re-read this order's return data from Supabase (via the same
      // get-orders-by-email the "Track your order" screen already uses —
      // see src/pages/OrderLookup.jsx's refreshOrders()) so the item this
      // return was just submitted for immediately shows as no longer
      // returnable, without waiting for the customer to search again.
      onSubmitted?.()
    } catch (err) {
      setSubmitError(err.message || 'Something went wrong submitting your return. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="return-dialog__backdrop" onClick={onClose}>
      <div
        className="return-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="return-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="return-dialog__header">
          <div>
            <p className="return-dialog__eyebrow">
              <ReturnIcon width={14} height={14} /> Return request
            </p>
            <h2 id="return-dialog-title" className="text-h3">
              Order #{order.orderId}
            </h2>
          </div>
          <button type="button" className="return-dialog__close" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        {submitted ? (
          <div className="return-dialog__body">
            <p className="auth-form-success">
              <CheckIcon width={20} height={20} style={{ flex: 'none', color: '#4ade80' }} />
              <span>We've received your return request. Our team will review it shortly and keep you updated.</span>
            </p>
            <div className="return-dialog__actions">
              <Button type="button" variant="primary" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <form className="return-dialog__body" onSubmit={handleSubmit} noValidate>
            {needsItemPicker ? (
              <div className="auth-field" role="radiogroup" aria-labelledby="return-item-label">
                <span className="text-label" id="return-item-label">
                  Which item is this for?
                </span>
                <div className="return-dialog__items">
                  {returnableItems.map((item, i) => {
                    const value = item.id ?? ''
                    const selected = itemId === value
                    return (
                      <label
                        key={value || i}
                        className={'return-dialog__item' + (selected ? ' return-dialog__item--selected' : '')}
                      >
                        <input
                          type="radio"
                          name="return-item"
                          value={value}
                          checked={selected}
                          onChange={() => setItemId(value)}
                        />
                        <ItemImage src={item.imageUrl} alt={item.product_name} size="lg" />
                        <span className="return-dialog__item-info">
                          <strong>{item.product_name}</strong>
                          <small>
                            Size {item.size} · Qty {item.quantity}
                          </small>
                        </span>
                        <span className="return-dialog__item-check" aria-hidden="true">
                          <CheckIcon width={14} height={14} />
                        </span>
                      </label>
                    )
                  })}
                </div>
                {itemError && (
                  <p id="return-item-error" className="auth-field__error" role="alert">
                    {itemError}
                  </p>
                )}
              </div>
            ) : (
              returnableItems.length === 1 && (
                <div className="return-dialog__item return-dialog__item--static">
                  <ItemImage src={returnableItems[0].imageUrl} alt={returnableItems[0].product_name} size="lg" />
                  <span className="return-dialog__item-info">
                    <strong>{returnableItems[0].product_name}</strong>
                    <small>
                      Size {returnableItems[0].size} · Qty {returnableItems[0].quantity}
                    </small>
                  </span>
                </div>
              )
            )}

            <div className="auth-field">
              <label className="text-label" htmlFor="return-reason">
                Reason for return
              </label>
              <select
                id="return-reason"
                ref={reasonRef}
                className="input"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                aria-invalid={Boolean(reasonError)}
                aria-describedby={reasonError ? 'return-reason-error' : undefined}
                required
              >
                <option value="" disabled>
                  Select a reason
                </option>
                {RETURN_REASONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {reasonError && (
                <p id="return-reason-error" className="auth-field__error" role="alert">
                  {reasonError}
                </p>
              )}
            </div>

            <div className="auth-field">
              <label className="text-label" htmlFor="return-note">
                Additional note <span className="return-dialog__optional">(optional)</span>
              </label>
              <textarea
                id="return-note"
                className="input return-dialog__textarea"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Add any details that will help us process your return"
                rows={4}
                maxLength={500}
              />
            </div>

            {submitError && (
              <p className="auth-form-error" role="alert">
                {submitError}
              </p>
            )}

            <div className="return-dialog__actions">
              <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit return request'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M1 1L15 15M15 1L1 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export default ReturnRequestDialog
