import { useId, cloneElement } from 'react'

/**
 * Wraps a single form control with a label, optional hint, and an
 * accessible inline error — the same `aria-invalid`/`aria-describedby`/
 * `role="alert"` pattern already used in `Checkout.jsx`.
 *
 * @param {object} props
 * @param {string} props.label
 * @param {boolean} [props.required]
 * @param {string | false | undefined} [props.error]
 * @param {string} [props.hint]
 * @param {() => void} [props.onBlur]
 * @param {import('react').ReactElement} props.children - a single input/textarea/select
 */
function Field({ label, required, error, hint, onBlur, children }) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`

  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined

  const control = cloneElement(children, {
    id,
    onBlur: (event) => {
      children.props.onBlur?.(event)
      onBlur?.()
    },
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    'aria-required': required || undefined,
  })

  return (
    <div className="admin-field">
      <label htmlFor={id} className="admin-field__label text-label">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {control}
      {hint && !error && (
        <span id={hintId} className="admin-field__hint text-small">
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className="admin-field__error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}

export default Field
