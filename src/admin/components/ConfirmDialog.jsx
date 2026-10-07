import { useEffect, useRef } from 'react'

/**
 * A small, accessible confirmation dialog. Used for delete flows so a
 * single click can never destroy data (Part 07 brief §8).
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} props.title
 * @param {string} props.description
 * @param {string} [props.confirmLabel]
 * @param {string} [props.cancelLabel]
 * @param {boolean} [props.destructive]
 * @param {() => void} props.onConfirm
 * @param {() => void} props.onCancel
 */
function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}) {
  const confirmRef = useRef(null)

  useEffect(() => {
    if (!open) return
    confirmRef.current?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="admin-dialog__backdrop" onClick={onCancel}>
      <div
        className="admin-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="admin-dialog-title"
        aria-describedby="admin-dialog-description"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="admin-dialog-title" className="text-h3">
          {title}
        </h2>
        <p id="admin-dialog-description" className="text-small admin-dialog__description">
          {description}
        </p>
        <div className="admin-dialog__actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            ref={confirmRef}
            className={'btn ' + (destructive ? 'admin-btn-danger' : 'btn-primary')}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialog
