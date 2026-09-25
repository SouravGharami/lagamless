import { useEffect, useRef, useState } from 'react'

/**
 * Shown when an admin clicks "Add note" / "Edit note" on a replacement
 * request. Unlike RejectReturnDialog this field is optional — an empty save
 * clears the note. The note is internal-only (`replacements.admin_note`,
 * see supabase/part-27-replacements-admin-note.sql) and is never shown to
 * the customer, unlike a rejection reason.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {{ id: string, orderId: string, customerName?: string, customerEmail?: string, adminNote?: string | null } | null} props.target
 * @param {(note: string) => void} props.onConfirm
 * @param {() => void} props.onCancel
 * @param {boolean} [props.saving]
 */
function AdminNoteDialog({ open, target, onConfirm, onCancel, saving = false }) {
  const [note, setNote] = useState('')
  const fieldRef = useRef(null)

  // Reset to the request's current note whenever a different one is opened.
  useEffect(() => {
    if (!open) return
    setNote(target?.adminNote || '')
    fieldRef.current?.focus()
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

  function handleSubmit(event) {
    event.preventDefault()
    if (saving) return
    onConfirm(note.trim())
  }

  return (
    <div className="admin-dialog__backdrop" onClick={saving ? undefined : onCancel}>
      <div
        className="admin-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-note-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="admin-note-dialog-title" className="text-h3">
          Internal note
        </h2>
        <p className="text-small admin-dialog__description">
          Order #{target.orderId.slice(0, 8).toUpperCase()}
          {target.customerName || target.customerEmail ? ` (${target.customerName || target.customerEmail})` : ''}.
          Visible to admins only — the customer never sees this.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="admin-field">
            <label className="text-label" htmlFor="admin-note-field">
              Note
            </label>
            <textarea
              id="admin-note-field"
              ref={fieldRef}
              className="input admin-form__textarea"
              rows={3}
              placeholder="e.g. Called customer to confirm size, checking stock with warehouse…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="admin-dialog__actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-secondary" disabled={saving}>
              {saving ? 'Saving…' : 'Save note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AdminNoteDialog
