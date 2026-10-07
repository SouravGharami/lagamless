import { useState } from 'react'
import Container from '../Container.jsx'
import Section from '../Section.jsx'
import Reveal from '../Reveal.jsx'
import './Newsletter.css'

// Homepage had no lead-capture mechanism at all — every visitor who wasn't
// ready to buy on this visit was a dead end. A 10% first-order incentive is
// the standard, proven hook on Indian D2C sites; this keeps the same
// restrained, editorial tone as the rest of the site instead of a loud
// pop-up. Client-side only (no backend wired yet) — swap handleSubmit for a
// real endpoint/ESP call when one exists.
function Newsletter() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | submitted | error

  function handleSubmit(event) {
    event.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setStatus('error')
      return
    }
    // TODO: wire to real email service / Supabase table when available.
    setStatus('submitted')
  }

  return (
    <Section tight className="newsletter">
      <Container className="newsletter__grid">
        <Reveal className="newsletter__copy">
          <h2 className="newsletter__headline">Join the movement</h2>
          <p className="newsletter__lede">
            Be the first to know about new drops, exclusive offers and more.
          </p>
        </Reveal>

        <Reveal delay={90} className="newsletter__form-wrap">
          {status === 'submitted' ? (
            <p className="newsletter__success">
              You&apos;re in. Check your inbox — welcome to LAGAMLESS.
            </p>
          ) : (
            <form className="newsletter__form" onSubmit={handleSubmit} noValidate>
              <label htmlFor="newsletter-email" className="visually-hidden">
                Email address
              </label>
              <input
                id="newsletter-email"
                type="email"
                inputMode="email"
                placeholder="Enter your email"
                className="newsletter__input"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (status === 'error') setStatus('idle')
                }}
                aria-invalid={status === 'error'}
              />
              <button type="submit" className="newsletter__submit" aria-label="Subscribe">
                →
              </button>
            </form>
          )}
          {status === 'error' && (
            <p className="newsletter__error" role="alert">
              That doesn&apos;t look like a valid email — give it another try.
            </p>
          )}
        </Reveal>

        <Reveal delay={120} className="newsletter__social">
          <a href="https://instagram.com" target="_blank" rel="noreferrer" aria-label="Instagram" className="newsletter__social-link">
            <InstagramIcon />
          </a>
          <a href="https://youtube.com" target="_blank" rel="noreferrer" aria-label="YouTube" className="newsletter__social-link">
            <YouTubeIcon />
          </a>
          <a href="https://pinterest.com" target="_blank" rel="noreferrer" aria-label="Pinterest" className="newsletter__social-link">
            <PinterestIcon />
          </a>
          <a href="https://spotify.com" target="_blank" rel="noreferrer" aria-label="Spotify" className="newsletter__social-link">
            <SpotifyIcon />
          </a>
        </Reveal>

        <Reveal delay={150} className="newsletter__tagline">
          <p>Wear different.</p>
          <p>Belong to more.</p>
        </Reveal>
      </Container>
    </Section>
  )
}

function InstagramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" />
    </svg>
  )
}

function YouTubeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2.5" y="5.5" width="19" height="13" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 9.5l5 2.5-5 2.5v-5z" fill="currentColor" />
    </svg>
  )
}

function PinterestIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9.5 18c1-3 1.5-5.2 1.5-5.2m0 0C10.6 11 12 9 14 9.6c1.6.5 1.8 2.6 1.2 4-1 2.3-3.6 2.4-4.2.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function SpotifyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7.5 10.2c3-.9 6.4-.7 9 .8M8 13.2c2.5-.7 5.2-.5 7.3.7M8.5 16c1.9-.5 4-.4 5.6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export default Newsletter
