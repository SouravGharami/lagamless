import { Link } from 'react-router-dom'

const VARIANT_CLASS = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
}

/**
 * Shared button. Renders a <Link> when `to` is provided, otherwise a <button>.
 */
function Button({ variant = 'primary', to, block = false, className = '', children, ...rest }) {
  const classes = ['btn', VARIANT_CLASS[variant] ?? VARIANT_CLASS.primary, block ? 'btn-block' : '', className]
    .filter(Boolean)
    .join(' ')

  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {children}
      </Link>
    )
  }

  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  )
}

export default Button
