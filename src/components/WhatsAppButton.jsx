import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import './WhatsAppButton.css'

// Floating WhatsApp chat button (customer storefront, desktop + mobile).
//
// The business number comes from VITE_WHATSAPP_NUMBER (country code + number, digits only), e.g.
//   VITE_WHATSAPP_NUMBER=919876543210
// in the project's .env file (local) and in the hosting provider's environment variables (live site).
// Restart `npm run dev` after editing .env, and rebuild/redeploy for production.
const RAW_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER || ''
const BRAND = 'LAGAMLESS'

/** Digits only; a bare 10-digit Indian mobile gets the 91 prefix. */
function normalizeNumber(raw) {
  const digits = String(raw).replace(/\D/g, '').replace(/^00/, '')
  if (/^[6-9]\d{9}$/.test(digits)) return `91${digits}`
  return digits
}

const WHATSAPP_NUMBER = normalizeNumber(RAW_NUMBER)
// 11-15 digits, and not an all-zero placeholder.
const IS_VALID = /^\d{11,15}$/.test(WHATSAPP_NUMBER) && !/0{8,}/.test(WHATSAPP_NUMBER)

/** Pre-filled message that tells you which page the customer was looking at. */
function buildMessage(pathname) {
  const onProduct = pathname.startsWith('/product/')
  const url = typeof window !== 'undefined' ? window.location.href : ''
  return onProduct
    ? `Hi ${BRAND}, I have a question about this product:\n${url}`
    : `Hi ${BRAND}, I have a question about an order/product.`
}

function WhatsAppButton() {
  const { pathname } = useLocation()
  const [expanded, setExpanded] = useState(false)

  // Greet with the label once, a few seconds after load (desktop only, see CSS), then collapse to the round icon.
  useEffect(() => {
    if (!IS_VALID) return undefined
    const open = window.setTimeout(() => setExpanded(true), 3500)
    const close = window.setTimeout(() => setExpanded(false), 9000)
    return () => {
      window.clearTimeout(open)
      window.clearTimeout(close)
    }
  }, [])

  // No number configured: say so in development instead of silently vanishing; stay hidden on the live site.
  if (!IS_VALID) {
    if (!import.meta.env.DEV) return null
    return (
      <div className="whatsapp-fab whatsapp-fab--unset" role="note">
        <WhatsAppIcon />
        <span className="whatsapp-fab__label whatsapp-fab__label--static">
          Add VITE_WHATSAPP_NUMBER to .env, then restart npm run dev
        </span>
      </div>
    )
  }

  // api.whatsapp.com/send opens the app directly on Android/iOS and, on desktop, offers WhatsApp Desktop or
  // WhatsApp Web. It also avoids the wa.me redirect hop that in-app browsers (Instagram, Facebook) often block.
  const href = `https://api.whatsapp.com/send?phone=${WHATSAPP_NUMBER}&text=${encodeURIComponent(buildMessage(pathname))}`

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`whatsapp-fab${expanded ? ' is-expanded' : ''}`}
      aria-label="Chat with us on WhatsApp"
      onFocus={() => setExpanded(true)}
      onBlur={() => setExpanded(false)}
    >
      <span className="whatsapp-fab__pulse" aria-hidden="true" />
      <span className="whatsapp-fab__icon">
        <WhatsAppIcon />
        <span className="whatsapp-fab__dot" aria-hidden="true" />
      </span>
      <span className="whatsapp-fab__label">
        <strong>Chat with us</strong>
        <small>Typically replies in minutes</small>
      </span>
    </a>
  )
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M16.03 3C9.16 3 3.6 8.56 3.6 15.43c0 2.35.65 4.55 1.78 6.44L3 29l7.32-2.34a12.4 12.4 0 0 0 5.7 1.4h.01c6.87 0 12.43-5.56 12.43-12.43C28.46 8.76 22.9 3 16.03 3zm0 22.55h-.01a10.3 10.3 0 0 1-5.26-1.44l-.38-.22-4.34 1.39 1.42-4.23-.25-.4a10.3 10.3 0 0 1-1.58-5.52c0-5.7 4.65-10.34 10.35-10.34 2.77 0 5.36 1.08 7.32 3.04a10.28 10.28 0 0 1 3.03 7.32c0 5.71-4.65 10.4-10.3 10.4zm5.68-7.76c-.31-.16-1.84-.91-2.13-1.01-.29-.11-.5-.16-.71.16-.21.31-.81 1.01-1 1.22-.18.21-.37.23-.68.08-.31-.16-1.32-.49-2.51-1.55-.93-.83-1.56-1.86-1.74-2.17-.18-.31-.02-.48.14-.63.14-.14.31-.37.47-.55.16-.18.21-.31.31-.52.1-.21.05-.39-.02-.55-.08-.16-.71-1.72-.98-2.35-.26-.62-.52-.54-.71-.55h-.6c-.21 0-.55.08-.84.39-.29.31-1.1 1.08-1.1 2.63s1.13 3.05 1.29 3.26c.16.21 2.22 3.39 5.38 4.76.75.32 1.34.51 1.79.66.75.24 1.44.2 1.98.13.6-.09 1.84-.75 2.1-1.48.26-.72.26-1.34.18-1.47-.08-.14-.29-.21-.6-.37z"
      />
    </svg>
  )
}

export default WhatsAppButton
