import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Container from '../components/Container.jsx'
import Section from '../components/Section.jsx'
import Button from '../components/Button.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { onAuthStateChange } from '../services/auth.js'
import { validatePassword, validatePasswordsMatch } from '../lib/authValidation.js'
import './Auth.css'

/**
 * Landing page for the link emailed by ForgotPassword's
 * `resetPasswordForEmail(... redirectTo: '/reset-password')`.
 *
 * Supabase's client automatically detects the recovery token in the URL
 * and establishes a temporary "recovery" session before this component
 * even mounts (or shortly after, via a `PASSWORD_RECOVERY` auth event) —
 * there is no manual token parsing here. If no recovery session exists
 * (e.g. someone navigates here directly, or the link expired), the form
 * is not shown and the person is pointed back to ForgotPassword instead.
 */
function ResetPassword() {
  const { session, loading, updatePassword } = useAuth()
  const navigate = useNavigate()

  const [hasRecoverySession, setHasRecoverySession] = useState(Boolean(session))
  const [form, setForm] = useState({ password: '', confirmPassword: '' })
  const [touched, setTouched] = useState({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    // A session already present when this page loads (e.g. Supabase
    // resolved the recovery link before AuthContext's own listener fired)
    // counts too — we don't require the PASSWORD_RECOVERY event
    // specifically, just *some* active session to act against. This is a
    // legitimate "synchronize with an external system" effect (the
    // Supabase Auth client), not a derivable-at-render value, so it's the
    // same class of oxlint react(set-state-in-effect) warning already
    // accepted for CartContext.jsx since Part 04 (see BUILD_STATUS.md).
    if (session) setHasRecoverySession(true)

    const unsubscribe = onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setHasRecoverySession(true)
    })
    return unsubscribe
  }, [session])

  const errors = {
    password: validatePassword(form.password),
    confirmPassword: validatePasswordsMatch(form.password, form.confirmPassword),
  }
  const valid = !errors.password && !errors.confirmPassword

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
      await updatePassword(form.password)
      setDone(true)
    } catch (err) {
      const message = err?.message ?? ''
      setFormError(
        /fetch|network/i.test(message)
          ? 'Network error — please check your connection and try again.'
          : 'Could not update your password. The reset link may have expired — request a new one.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="auth-route-loading" role="status" aria-live="polite">
        <p className="text-label">Loading…</p>
      </div>
    )
  }

  return (
    <Section>
      <Container>
        <p className="text-label">Account</p>
        <h1 className="text-h1" style={{ marginTop: '1rem' }}>
          Reset password
        </h1>

        <div className="auth-layout">
          <div className="auth-card">
            {done ? (
              <>
                <p className="auth-form-success">Your password has been updated.</p>
                <Button variant="primary" block onClick={() => navigate('/account', { replace: true })}>
                  Continue to your account
                </Button>
              </>
            ) : hasRecoverySession ? (
              <form className="auth-form" onSubmit={handleSubmit} noValidate>
                <div className="auth-field">
                  <label className="text-label" htmlFor="password">
                    New password
                  </label>
                  <input
                    id="password"
                    name="password"
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={handleChange('password')}
                    onBlur={handleBlur('password')}
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

                <div className="auth-field">
                  <label className="text-label" htmlFor="confirmPassword">
                    Confirm new password
                  </label>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    value={form.confirmPassword}
                    onChange={handleChange('confirmPassword')}
                    onBlur={handleBlur('confirmPassword')}
                    aria-invalid={Boolean(showError('confirmPassword'))}
                    aria-describedby={showError('confirmPassword') ? 'confirmPassword-error' : undefined}
                    required
                  />
                  {showError('confirmPassword') && (
                    <p id="confirmPassword-error" className="auth-field__error" role="alert">
                      {errors.confirmPassword}
                    </p>
                  )}
                </div>

                {formError && (
                  <p className="auth-form-error" role="alert">
                    {formError}
                  </p>
                )}

                <Button type="submit" variant="primary" block disabled={submitting}>
                  {submitting ? 'Updating…' : 'Update password'}
                </Button>
              </form>
            ) : (
              <>
                <p className="auth-form-error" role="alert">
                  This password reset link is invalid or has expired.
                </p>
                <div className="auth-footer-links">
                  <Link to="/forgot-password">Request a new link</Link>
                </div>
              </>
            )}
          </div>
        </div>
      </Container>
    </Section>
  )
}

export default ResetPassword
