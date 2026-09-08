import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { updateMyProfile } from '../../services/profiles.js'
import Field from '../components/Field.jsx'

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Authenticated admin account/settings view, built entirely on the
 * existing Supabase Auth/profile architecture (Part 08B-1/08B-2A) — no
 * new table, no fake persistent "store settings", and no payment/shipping
 * configuration UI (that belongs to Part 09). Editing full name reuses
 * the existing `updateMyProfile()` service, so it's a real write, not a
 * local-only stand-in.
 */
function AdminSettings() {
  const { user, profile, profileLoading, signOut } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  function startEditingName() {
    setFullName(profile?.full_name || '')
    setEditingName(true)
    setSaved(false)
    setSaveError(null)
  }

  async function handleSaveName(event) {
    event.preventDefault()
    setSaving(true)
    setSaveError(null)
    try {
      await updateMyProfile({ fullName })
      setEditingName(false)
      setSaved(true)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleLogout() {
    setLoggingOut(true)
    await signOut()
    navigate('/')
  }

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1 className="text-h2">Settings</h1>
          <p className="text-small">Your authenticated admin account, backed by Supabase Auth.</p>
        </div>
      </div>

      {saved && (
        <p className="admin-notice" role="status">
          Profile updated.
        </p>
      )}
      {saveError && (
        <p className="admin-form__summary" role="alert">
          {saveError}
        </p>
      )}

      <fieldset className="admin-form__section">
        <legend className="text-h3">Account</legend>

        {profileLoading ? (
          <p className="text-small">Loading account…</p>
        ) : (
          <div className="admin-form__grid">
            <Field label="Email">
              <input className="input" value={user?.email || ''} readOnly disabled />
            </Field>

            <Field label="Role">
              <input className="input" value={profile?.role || 'unknown'} readOnly disabled />
            </Field>

            {editingName ? (
              <Field label="Profile name" hint="Saved to your profile — this is a real write, not a local-only preview.">
                <input
                  className="input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoFocus
                />
              </Field>
            ) : (
              <Field label="Profile name">
                <input className="input" value={profile?.full_name || 'Not set'} readOnly disabled />
              </Field>
            )}

            <Field label="Account created">
              <input className="input" value={formatDateTime(profile?.created_at || user?.created_at)} readOnly disabled />
            </Field>

            <Field label="Last signed in">
              <input className="input" value={formatDateTime(user?.last_sign_in_at)} readOnly disabled />
            </Field>
          </div>
        )}

        {!profileLoading && (
          <div className="admin-form__actions">
            {editingName ? (
              <>
                <button type="button" className="btn btn-primary" onClick={handleSaveName} disabled={saving}>
                  {saving ? 'Saving…' : 'Save name'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingName(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={startEditingName}>
                Edit profile name
              </button>
            )}
          </div>
        )}
      </fieldset>

      <fieldset className="admin-form__section">
        <legend className="text-h3">Session</legend>
        <p className="text-small">
          Signing out ends your current admin session. You'll need to sign back in with an admin account to
          return to this panel.
        </p>
        <div className="admin-form__actions">
          <button type="button" className="btn btn-primary" onClick={handleLogout} disabled={loggingOut}>
            {loggingOut ? 'Logging out…' : 'Log out'}
          </button>
        </div>
      </fieldset>

      <fieldset className="admin-form__section">
        <legend className="text-h3">Shipping &amp; payments</legend>
        <p className="text-small">
          Shipping and payment provider configuration will be added once those integrations are connected in
          Part 09. No API keys or credentials are collected anywhere in this admin panel.
        </p>
      </fieldset>
    </div>
  )
}

export default AdminSettings
