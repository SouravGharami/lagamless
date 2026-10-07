/**
 * Auth form validation — pure functions, no React/DOM dependency, same
 * pattern as `checkoutValidation.js`.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8

export function validateEmail(value) {
  if (!value || !value.trim()) return 'Email is required.'
  if (!EMAIL_RE.test(value.trim())) return 'Enter a valid email address.'
  return null
}

export function validateFullName(value) {
  if (!value || !value.trim()) return 'Full name is required.'
  if (value.trim().length < 2) return 'Enter your full name.'
  return null
}

/** Reasonable-strength check, not a security theater requirement list. */
export function validatePassword(value) {
  if (!value) return 'Password is required.'
  if (value.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  return null
}

export function validatePasswordsMatch(password, confirmPassword) {
  if (!confirmPassword) return 'Confirm your password.'
  if (password !== confirmPassword) return 'Passwords do not match.'
  return null
}

export { MIN_PASSWORD_LENGTH }
