import { useEffect, useRef, useState } from 'react'
import Button from './Button.jsx'
import { getReplacementOptions, submitReplacementRequest } from '../services/replacements.js'
import {
  REPLACEMENT_REASONS,
  REPLACEMENT_STATUS_LABELS,
  describeReplacementChange,
} from '../lib/replacementStatus.js'
// Modal shell styles come from the return dialog (imported, not modified).
import './ReturnRequestDialog.css'
import './ReplacementRequestDialog.css'
import { SwapIcon } from './TrackIcons.jsx'
import ItemImage from './ItemImage.jsx'

/**
 * Replacement-request form opened from a delivered order's "Replace" button
 * (see OrderHistory.jsx).
 *
 * The customer is replacing the SAME product they bought — there is no product
 * picker — and may choose a different available size and/or color, a reason
 * (required) and an optional note. Choices come from the
 * `get-replacement-options` edge function; the request goes to
 * `submit-replacement-request`, which re-validates everything server-side
 * (ownership, DELIVERED, same product, size in stock, color offered,
 * duplicates). This form's own checks only keep the UI responsive.
 *
 * The dialog body mounts fresh every time it opens (see the wrapper), so each
 * open starts from a clean form with no reset logic.
 *
 * @param {{
 *   open: boolean,
 *   order: { orderId: string } | null,
 *   customerEmail: string,
 *   onClose: () => void,
 *   onSubmitted?: () => void,
 * }} props
 */
function ReplacementRequestDialog({ open, order, customerEmail, onClose, onSubmitted }) {
  if (!open || !order) return null
  return (
    <DialogBody
      key={order.orderId}
      orderId={order.orderId}
      customerEmail={customerEmail}
      onClose={onClose}
      onSubmitted={onSubmitted}
    />
  )
}

function DialogBody({ orderId, customerEmail, onClose, onSubmitted }) {
  const [options, setOptions] = useState({ status: 'loading', items: [], error: null })
  const [itemId, setItemId] = useState('')
  // null = "not touched yet" → fall back to the size the customer already has.
  const [sizeChoice, setSizeChoice] = useState(null)
  const [color, setColor] = useState('') // '' = keep my current color
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [submitted, setSubmitted] = useState(null) // summary of what was just requested
  const dialogRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    getReplacementOptions({ orderId, email: customerEmail })
      .then((data) => {
        if (!cancelled) setOptions({ status: 'ready', items: data.items ?? [], error: null })
      })
      .catch((err) => {
        if (!cancelled) {
          setOptions({
            status: 'error',
            items: [],
            error: err.message || 'We could not load your replacement options. Please try again.',
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [orderId, customerEmail])

  // The parent re-renders (and hands us a new onClose) whenever it refreshes
  // the order list, e.g. when the tab regains focus. Reading the latest
  // onClose/submitting through refs keeps this effect mounted once, so a
  // refresh can never steal focus from the field the customer is typing in.
  const onCloseRef = useRef(onClose)
  const submittingRef = useRef(false)
  useEffect(() => {
    onCloseRef.current = onClose
    submittingRef.current = submitting
  })

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape' && !submittingRef.current) onCloseRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [])

  const replaceableItems = options.items.filter((item) => !item.blockedReason)
  const needsItemPicker = replaceableItems.length > 1
  const activeItem =
    replaceableItems.length === 1
      ? replaceableItems[0]
      : (replaceableItems.find((item) => item.orderItemId === itemId) ?? null)

  const currentSizeAvailable = Boolean(
    activeItem?.sizes.some((s) => s.size === activeItem.size && s.available),
  )
  const size = sizeChoice ?? (currentSizeAvailable ? activeItem.size : '')
  const hasColors = (activeItem?.colors.length ?? 0) > 0
  const anySizeAvailable = Boolean(activeItem?.sizes.some((s) => s.available))

  // --- Validation (UI-side only; the server re-checks all of it) -----------
  const errors = {}
  if (needsItemPicker && !activeItem) errors.item = 'Select which item you want replaced.'
  if (activeItem) {
    if (!size) errors.size = 'Select the size you would like.'
    if (!reason) errors.reason = 'Select a reason for your replacement.'
    if (reason === 'Wrong size' && size && size === activeItem.size) {
      errors.size = 'You picked “Wrong size”, so choose a different size to receive.'
    }
    if (reason === 'Wrong color' && !color) {
      errors.color = hasColors
        ? 'You picked “Wrong color”, so choose the color you would like.'
        : 'This product isn’t offered in other colors. Pick another reason, or choose “Other” and tell us in the note.'
    }
  }
  const show = (key) => (submitAttempted ? errors[key] : null)

  function handleItemChange(nextId) {
    setItemId(nextId)
    setSizeChoice(null)
    setColor('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitAttempted(true)
    setSubmitError(null)
    if (!activeItem || Object.keys(errors).length > 0 || submitting) return

    setSubmitting(true)
    try {
      await submitReplacementRequest({
        orderId,
        email: customerEmail,
        orderItemId: activeItem.orderItemId,
        requestedSize: size,
        requestedColor: color || null,
        reason,
        note,
      })
      setSubmitted({
        productName: activeItem.productName,
        change: describeReplacementChange({
          originalSize: activeItem.size,
          requestedSize: size,
          requestedColor: color || null,
        }),
        reason,
      })
      // Re-read this customer's replacements so the order card immediately
      // shows the new status (and the Replace button for this item goes away).
      onSubmitted?.()
    } catch (err) {
      setSubmitError(err.message || 'Something went wrong submitting your replacement request. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const backdropClose = submitting ? undefined : onClose

  return (
    <div className="return-dialog__backdrop" onClick={backdropClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="return-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="replace-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="return-dialog__header">
          <div>
            <p className="return-dialog__eyebrow">
              <SwapIcon width={14} height={14} /> Replacement request
            </p>
            <h2 id="replace-dialog-title" className="text-h3">
              Order #{orderId}
            </h2>
          </div>
          <button type="button" className="return-dialog__close" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        {submitted ? (
          <div className="return-dialog__body">
            <p className="auth-form-success" role="status">
              We've received your replacement request. Our team will review it shortly — you can follow its status
              on your order.
            </p>
            <dl className="replace-dialog__confirmation">
              <div>
                <dt>Item</dt>
                <dd>{submitted.productName}</dd>
              </div>
              <div>
                <dt>You asked for</dt>
                <dd>{submitted.change}</dd>
              </div>
              <div>
                <dt>Reason</dt>
                <dd>{submitted.reason}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{REPLACEMENT_STATUS_LABELS.requested}</dd>
              </div>
            </dl>
            <div className="return-dialog__actions">
              <Button type="button" variant="primary" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        ) : options.status === 'loading' ? (
          <div className="return-dialog__body">
            <p className="text-small" role="status">
              Loading your options…
            </p>
          </div>
        ) : options.status === 'error' ? (
          <div className="return-dialog__body">
            <p className="auth-form-error" role="alert">
              {options.error}
            </p>
            <div className="return-dialog__actions">
              <Button type="button" variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        ) : replaceableItems.length === 0 ? (
          <div className="return-dialog__body">
            <p className="text-small">Nothing on this order can be replaced right now.</p>
            {[...new Set(options.items.map((item) => item.blockedReason).filter(Boolean))].map((why) => (
              <p key={why} className="text-small replace-dialog__hint">
                {why}
              </p>
            ))}
            <div className="return-dialog__actions">
              <Button type="button" variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <form className="return-dialog__body" onSubmit={handleSubmit} noValidate>
            {needsItemPicker && (
              <div className="auth-field">
                <label className="text-label" htmlFor="replace-item">
                  Which item is this for?
                </label>
                <select
                  id="replace-item"
                  className="input"
                  value={itemId}
                  onChange={(event) => handleItemChange(event.target.value)}
                  aria-invalid={Boolean(show('item'))}
                  aria-describedby={show('item') ? 'replace-item-error' : undefined}
                  required
                >
                  <option value="" disabled>
                    Select an item
                  </option>
                  {replaceableItems.map((item) => (
                    <option key={item.orderItemId} value={item.orderItemId}>
                      {item.productName} · Size {item.size} · Qty {item.quantity}
                    </option>
                  ))}
                </select>
                {show('item') && (
                  <p id="replace-item-error" className="auth-field__error" role="alert">
                    {errors.item}
                  </p>
                )}
              </div>
            )}

            {activeItem && (
              <>
                <div className="replace-dialog__product">
                  <ItemImage
                    src={(order?.items || []).find((i) => i.id === activeItem.orderItemId)?.imageUrl}
                    alt={activeItem.productName}
                    size="lg"
                  />
                  <p className="text-small replace-dialog__summary">
                    Replacing <strong>{activeItem.productName}</strong> · Size {activeItem.size} · Qty{' '}
                    {activeItem.quantity}. You'll receive the same product in the size and color you choose below
                    {activeItem.quantity > 1 ? `, for all ${activeItem.quantity} units on this line` : ''}.
                  </p>
                </div>

                <div className="auth-field">
                  <span className="text-label" id="replace-size-label">
                    Size you'd like
                  </span>
                  <div className="replace-dialog__choices" role="group" aria-labelledby="replace-size-label">
                    {activeItem.sizes.map((s) => (
                      <button
                        key={s.size}
                        type="button"
                        className="replace-dialog__choice"
                        aria-pressed={size === s.size}
                        disabled={!s.available}
                        onClick={() => setSizeChoice(s.size)}
                      >
                        {s.size}
                        {s.size === activeItem.size && s.available && (
                          <span className="replace-dialog__choice-tag">Current</span>
                        )}
                        {!s.available && <span className="replace-dialog__choice-tag">Out of stock</span>}
                      </button>
                    ))}
                  </div>
                  {!anySizeAvailable && (
                    <p className="text-small replace-dialog__hint">
                      No sizes of this product are in stock right now, so a replacement can't be requested yet.
                    </p>
                  )}
                  {show('size') && (
                    <p className="auth-field__error" role="alert">
                      {errors.size}
                    </p>
                  )}
                </div>

                {hasColors && (
                  <div className="auth-field">
                    <span className="text-label" id="replace-color-label">
                      Color you'd like
                    </span>
                    <div className="replace-dialog__choices" role="group" aria-labelledby="replace-color-label">
                      <button
                        type="button"
                        className="replace-dialog__choice"
                        aria-pressed={color === ''}
                        onClick={() => setColor('')}
                      >
                        Keep my color
                      </button>
                      {activeItem.colors.map((c) => (
                        <button
                          key={c.name}
                          type="button"
                          className="replace-dialog__choice"
                          aria-pressed={color === c.name}
                          onClick={() => setColor(c.name)}
                        >
                          <span className="replace-dialog__dot" style={{ backgroundColor: c.hex }} aria-hidden="true" />
                          {c.name}
                        </button>
                      ))}
                    </div>
                    {show('color') && (
                      <p className="auth-field__error" role="alert">
                        {errors.color}
                      </p>
                    )}
                  </div>
                )}
                {!hasColors && show('color') && (
                  <p className="auth-field__error" role="alert">
                    {errors.color}
                  </p>
                )}

                <div className="auth-field">
                  <label className="text-label" htmlFor="replace-reason">
                    Reason for replacement
                  </label>
                  <select
                    id="replace-reason"
                    className="input"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    aria-invalid={Boolean(show('reason'))}
                    aria-describedby={show('reason') ? 'replace-reason-error' : undefined}
                    required
                  >
                    <option value="" disabled>
                      Select a reason
                    </option>
                    {REPLACEMENT_REASONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {show('reason') && (
                    <p id="replace-reason-error" className="auth-field__error" role="alert">
                      {errors.reason}
                    </p>
                  )}
                </div>

                <div className="auth-field">
                  <label className="text-label" htmlFor="replace-note">
                    Additional note <span className="return-dialog__optional">(optional)</span>
                  </label>
                  <textarea
                    id="replace-note"
                    className="input return-dialog__textarea"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Add any details that will help us process your replacement"
                    rows={4}
                    maxLength={500}
                  />
                </div>
              </>
            )}

            {submitError && (
              <p className="auth-form-error" role="alert">
                {submitError}
              </p>
            )}

            <div className="return-dialog__actions">
              <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={submitting || (Boolean(activeItem) && !anySizeAvailable)}>
                {submitting ? 'Submitting…' : 'Submit replacement request'}
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

export default ReplacementRequestDialog
