import { useId, cloneElement, Children } from 'react'

/**
 * Wraps a single form control with a label, optional hint, and an
 * accessible inline error — the same `aria-invalid`/`aria-describedby`/
 * `role="alert"` pattern already used in `Checkout.jsx`.
 *
 * `children` is usually a single input/textarea/select, but a couple of
 * call sites in `ProductForm.jsx` ("Category", "Fit") pass an `<input>`
 * *plus* a sibling `<datalist>` for autocomplete options. Only the first
 * child is treated as the actual form control (it gets `id`,
 * `aria-*`, and the merged `onBlur`) — any additional children are
 * rendered as-is, unmodified, right after it. Previously this component
 * assumed `children` was always a single element and called
 * `cloneElement(children, ...)` directly; when `children` was actually an
 * array (input + datalist), `cloneElement` silently produced an element
 * with an `undefined` type, which crashed the whole form with "Element
 * type is invalid" the moment React tried to render it.
 *
 * @param {object} props
 * @param {string} props.label
 * @param {boolean} [props.required]
 * @param {string | false | undefined} [props.error]
 * @param {string} [props.hint]
 * @param {() => void} [props.onBlur]
 * @param {import('react').ReactNode} props.children - a single input/textarea/select, or that plus auxiliary elements (e.g. a `<datalist>`)
 */
function Field({ label, required, error, hint, onBlur, children }) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`

  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined

  const childArray = Children.toArray(children)
  const [primaryChild, ...restChildren] = childArray

  const control = cloneElement(primaryChild, {
    id,
    onBlur: (event) => {
      primaryChild.props.onBlur?.(event)
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
      {restChildren}
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
