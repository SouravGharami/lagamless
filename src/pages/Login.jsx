import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Container from '../components/Container.jsx'
import Section from '../components/Section.jsx'
import Button from '../components/Button.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { validateEmail } from '../lib/authValidation.js'
import './Auth.css'

const EMAIL_UNCONFIRMED_MESSAGE = 'Please confirm your email address before signing in — check your inbox.'
const INVALID_CREDENTIALS_MESSAGE = 'Incorrect email or password.'
const GENERIC_ERROR_MESSAGE = 'Something went wrong signing you in. Please try again.'

function Login() {
  const { signIn, isSupabaseConfigured } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [touched, setTouched] = useState({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)

  const errors = {
    email: validateEmail(email),
    password: password ? null : 'Password is required.',
  }
  const valid = !errors.email && !errors.password

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
      await signIn(email, password)
      const redirectTo = location.state?.from?.pathname ?? '/account'
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setFormError(mapLoginError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Section>
      <Container>
        <p className="text-label">Account</p>
        <h1 className="text-h1" style={{ marginTop: '1rem' }}>
          Sign in
        </h1>

        <div className="auth-layout">
          <div className="auth-card">
            {!isSupabaseConfigured && (
              <p className="auth-form-error" role="alert">
                Accounts are not available yet — this project has not been connected to Supabase.
              </p>
            )}

            <form className="auth-form" onSubmit={handleSubmit} noValidate>
              <div className="auth-field">
                <label className="text-label" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  className="input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
                  aria-invalid={Boolean(showError('email'))}
                  aria-describedby={showError('email') ? 'email-error' : undefined}
                  required
                />
                {showError('email') && (
                  <p id="email-error" className="auth-field__error" role="alert">
                    {errors.email}
                  </p>
                )}
              </div>

              <div className="auth-field">
                <label className="text-label" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
                  aria-invalid={Boolean(showError('password'))}
                  aria-describedby={showError('password') ? 'password-error' : undefined}
                  required
                />
                {showError('password') && (
                  <p id="password-error" className="auth-field__error" role="alert">
                    {errors.password}
                  </p>
                )}
              </div>

              {formError && (
                <p className="auth-form-error" role="alert">
                  {formError}
                </p>
              )}

              <Button type="submit" variant="primary" block disabled={submitting}>
                {submitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>

            <div className="auth-footer-links">
              <Link to="/forgot-password">Forgot your password?</Link>
              <span>
                New here? <Link to="/signup">Create an account</Link>
              </span>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  )
}

function mapLoginError(err) {
  const message = err?.message ?? ''
  if (/email not confirmed/i.test(message)) return EMAIL_UNCONFIRMED_MESSAGE
  if (/invalid login credentials/i.test(message)) return INVALID_CREDENTIALS_MESSAGE
  if (/not connected to supabase|not available yet/i.test(message)) return message
  if (/fetch|network/i.test(message)) return 'Network error — please check your connection and try again.'
  return GENERIC_ERROR_MESSAGE
}

export default Login
