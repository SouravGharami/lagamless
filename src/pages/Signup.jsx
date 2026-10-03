import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Container from '../components/Container.jsx'
import Section from '../components/Section.jsx'
import Button from '../components/Button.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { validateEmail, validateFullName, validatePassword, validatePasswordsMatch } from '../lib/authValidation.js'
import './Auth.css'

const ALREADY_REGISTERED_MESSAGE = 'An account with this email already exists. Try signing in instead.'
const GENERIC_ERROR_MESSAGE = 'Something went wrong creating your account. Please try again.'

function Signup() {
  const { signUp, isSupabaseConfigured } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirmPassword: '' })
  const [touched, setTouched] = useState({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)
  // When Supabase email confirmation is on, we never claim the user is
  // signed in — we show this instead of navigating anywhere.
  const [confirmationEmail, setConfirmationEmail] = useState(null)

  const errors = {
    fullName: validateFullName(form.fullName),
    email: validateEmail(form.email),
    password: validatePassword(form.password),
    confirmPassword: validatePasswordsMatch(form.password, form.confirmPassword),
  }
  const valid = !errors.fullName && !errors.email && !errors.password && !errors.confirmPassword

  function handleChange(field) {
    return (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))
  }

  function handleBlur(field) {
    return () => setTouched((prev) => ({ ...prev, [field]: true }))
  }

  function showError(field) {
    return (touched[field] || submitAttempted) && errors[field]
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitAttempted(true)
    setFormError(null)
    if (!valid || submitting) return

    setSubmitting(true)
    try {
      // Signup is always a customer — there is no role field on this
      // form, and none is ever sent to Supabase. See services/auth.js
      // and supabase/part-08b1-auth.sql §7 for how the default
      // role: 'customer' profile row is created safely.
      const result = await signUp(form.fullName, form.email, form.password)
      if (result.needsEmailConfirmation) {
        setConfirmationEmail(form.email.trim())
      } else {
        navigate('/account', { replace: true })
      }
    } catch (err) {
      setFormError(mapSignupError(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (confirmationEmail) {
    return (
      <Section>
        <Container>
          <p className="text-label">Account</p>
          <h1 className="text-h1" style={{ marginTop: '1rem' }}>
            Check your email
          </h1>
          <div className="auth-layout">
            <div className="auth-card">
              <p className="auth-form-success">
                We sent a confirmation link to <strong>{confirmationEmail}</strong>. Click it to activate your
                account, then come back and sign in.
              </p>
              <div className="auth-footer-links">
                <Link to="/admin/login">Go to sign in</Link>
              </div>
            </div>
          </div>
        </Container>
      </Section>
    )
  }

  return (
    <Section>
      <Container>
        <p className="text-label">Account</p>
        <h1 className="text-h1" style={{ marginTop: '1rem' }}>
          Create an account
        </h1>

        <div className="auth-layout">
          <div className="auth-card">
            {!isSupabaseConfigured && (
              <p className="auth-form-error" role="alert">
                Accounts are not available yet — this project has not been connected to Supabase.
              </p>
            )}

            <form className="auth-form" onSubmit={handleSubmit} noValidate>
              <Field
                label="Full name"
                id="fullName"
                autoComplete="name"
                value={form.fullName}
                onChange={handleChange('fullName')}
                onBlur={handleBlur('fullName')}
                error={showError('fullName')}
              />
              <Field
                label="Email"
                id="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={handleChange('email')}
                onBlur={handleBlur('email')}
                error={showError('email')}
              />
              <Field
                label="Password"
                id="password"
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={handleChange('password')}
                onBlur={handleBlur('password')}
                error={showError('password')}
              />
              <Field
                label="Confirm password"
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={handleChange('confirmPassword')}
                onBlur={handleBlur('confirmPassword')}
                error={showError('confirmPassword')}
              />

              {formError && (
                <p className="auth-form-error" role="alert">
                  {formError}
                </p>
              )}

              <Button type="submit" variant="primary" block disabled={submitting}>
                {submitting ? 'Creating account…' : 'Create account'}
              </Button>
            </form>

            <div className="auth-footer-links">
              <span>
                Already have an account? <Link to="/admin/login">Sign in</Link>
              </span>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  )
}

function Field({ label, id, value, onChange, onBlur, error, type = 'text', autoComplete }) {
  const errorId = `${id}-error`
  return (
    <div className="auth-field">
      <label className="text-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        name={id}
        className="input"
        type={type}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        autoComplete={autoComplete}
        required
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <p id={errorId} className="auth-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function mapSignupError(err) {
  const message = err?.message ?? ''
  if (/already registered|already exists|user already/i.test(message)) return ALREADY_REGISTERED_MESSAGE
  if (/not connected to supabase|not available yet/i.test(message)) return message
  if (/fetch|network/i.test(message)) return 'Network error — please check your connection and try again.'
  return GENERIC_ERROR_MESSAGE
}

export default Signup
