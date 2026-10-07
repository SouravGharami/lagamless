import { useState } from 'react'
import { Link } from 'react-router-dom'
import Container from '../components/Container.jsx'
import Section from '../components/Section.jsx'
import Button from '../components/Button.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { validateEmail } from '../lib/authValidation.js'
import './Auth.css'

// Deliberately generic: Supabase's resetPasswordForEmail() does not
// distinguish "email sent" from "no account with that email" in its
// response, and neither does this UI — showing the same success state
// either way avoids revealing whether an email is registered.
const GENERIC_SUCCESS_MESSAGE =
  "If an account exists for that email, we've sent a link to reset your password."

function ForgotPassword() {
  const { resetPassword, isSupabaseConfigured } = useAuth()

  const [email, setEmail] = useState('')
  const [touched, setTouched] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)
  const [sent, setSent] = useState(false)

  const emailError = validateEmail(email)
  const showError = (touched || submitAttempted) && emailError

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitAttempted(true)
    setFormError(null)
    if (emailError || submitting) return

    setSubmitting(true)
    try {
      await resetPassword(email)
      setSent(true)
    } catch (err) {
      // Even on a real error (e.g. Supabase misconfigured or offline),
      // avoid leaking account-existence details — but a network/config
      // failure is worth telling the person about so they can retry.
      const message = err?.message ?? ''
      if (/not connected to supabase|not available yet/i.test(message)) {
        setFormError(message)
      } else if (/fetch|network/i.test(message)) {
        setFormError('Network error — please check your connection and try again.')
      } else {
        // Fall back to the generic success message rather than surfacing
        // a raw error, consistent with not confirming/denying an account.
        setSent(true)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Section>
      <Container>
        <p className="text-label">Account</p>
        <h1 className="text-h1" style={{ marginTop: '1rem' }}>
          Forgot password
        </h1>

        <div className="auth-layout">
          <div className="auth-card">
            {!isSupabaseConfigured && (
              <p className="auth-form-error" role="alert">
                Accounts are not available yet — this project has not been connected to Supabase.
              </p>
            )}

            {sent ? (
              <p className="auth-form-success">{GENERIC_SUCCESS_MESSAGE}</p>
            ) : (
              <form className="auth-form" onSubmit={handleSubmit} noValidate>
                <p className="text-lead" style={{ marginBottom: '0.5rem' }}>
                  Enter the email on your account and we'll send you a link to reset your password.
                </p>
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
                    onBlur={() => setTouched(true)}
                    aria-invalid={Boolean(showError)}
                    aria-describedby={showError ? 'email-error' : undefined}
                    required
                  />
                  {showError && (
                    <p id="email-error" className="auth-field__error" role="alert">
                      {emailError}
                    </p>
                  )}
                </div>

                {formError && (
                  <p className="auth-form-error" role="alert">
                    {formError}
                  </p>
                )}

                <Button type="submit" variant="primary" block disabled={submitting}>
                  {submitting ? 'Sending…' : 'Send reset link'}
                </Button>
              </form>
            )}

            <div className="auth-footer-links">
              <Link to="/admin/login">Back to sign in</Link>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  )
}

export default ForgotPassword
