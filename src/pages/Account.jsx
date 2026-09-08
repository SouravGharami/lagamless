import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Container from '../components/Container.jsx'
import Section from '../components/Section.jsx'
import Button from '../components/Button.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { getMyProfile } from '../services/profiles.js'
import './Auth.css'

/**
 * Customer account page. Part 08B-1 scope: identity + logout only.
 * Order history is a placeholder state — real order data (reading from
 * the `orders` table) is Part 08B-2+/09 work, once orders are actually
 * created anywhere in the app.
 */
function Account() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    let active = true
    getMyProfile().then((data) => {
      if (active) {
        setProfile(data)
        setProfileLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [user?.id])

  async function handleLogout() {
    setSigningOut(true)
    try {
      await signOut()
      navigate('/', { replace: true })
    } finally {
      setSigningOut(false)
    }
  }

  const displayName = profile?.full_name || user?.user_metadata?.full_name || null
  const role = profile?.role ?? 'customer'

  return (
    <Section>
      <Container>
        <p className="text-label">Account</p>
        <h1 className="text-h1" style={{ marginTop: '1rem' }}>
          {displayName ? `Hi, ${displayName.split(' ')[0]}` : 'Your account'}
        </h1>

        <div className="account-layout">
          <div className="account-card">
            <dl style={{ margin: 0 }}>
              <div className="account-row">
                <dt>Name</dt>
                <dd>{profileLoading ? '—' : displayName || 'Not set'}</dd>
              </div>
              <div className="account-row">
                <dt>Email</dt>
                <dd>{user?.email}</dd>
              </div>
              <div className="account-row">
                <dt>Account type</dt>
                <dd>
                  <span className="account-role-badge">{profileLoading ? '—' : role}</span>
                </dd>
              </div>
            </dl>

            <Button variant="secondary" onClick={handleLogout} disabled={signingOut}>
              {signingOut ? 'Signing out…' : 'Log out'}
            </Button>
          </div>

          <div className="account-card">
            <h2 className="text-h3">Order history</h2>
            <p className="account-orders-empty">
              You haven't placed any orders yet. Order history will appear here once checkout is connected to your
              account.
            </p>
          </div>
        </div>
      </Container>
    </Section>
  )
}

export default Account
